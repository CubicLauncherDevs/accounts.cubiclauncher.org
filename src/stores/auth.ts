import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  parseSkin,
  post,
  request,
  type AccountDetails,
  type AuthSession,
  type FullProfile,
  type PlayerSkin,
  type SkinModel,
} from '@/lib/api'

const STORAGE_KEY = 'cubic-discord-session-v2'
const VERIFIER_KEY = 'cubic-discord-verifier'
const MIGRATION_KEY = 'cubic-legacy-migration'
function validSession(value: unknown): value is AuthSession {
  const s = value as AuthSession | null
  return (
    !!s &&
    typeof s.accessToken === 'string' &&
    /^[a-f0-9]{64}$/.test(s.accessToken) &&
    typeof s.clientToken === 'string' &&
    s.clientToken.length > 0 &&
    s.clientToken.length <= 1024 &&
    /^[a-f0-9]{32}$/.test(s.selectedProfile?.id ?? '') &&
    /^[A-Za-z0-9_]{3,16}$/.test(s.selectedProfile?.name ?? '')
  )
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(null)
  const skin = ref<PlayerSkin | null>(null)
  const profileLoaded = ref(false)
  const account = ref<AccountDetails | null>(null)
  const restoreError = ref<unknown>(null)
  const notice = ref('')
  const profile = computed(() => session.value?.selectedProfile ?? null)
  let restorePromise: Promise<void> | undefined
  let generation = 0

  function persist(value: AuthSession | null) {
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* The session still works in memory if storage is unavailable. */
    }
  }

  function clear() {
    generation++
    session.value = null
    skin.value = null
    profileLoaded.value = false
    account.value = null
    persist(null)
  }

  function restore(retry = false): Promise<void> {
    if (restorePromise && !retry) return restorePromise
    const revision = generation
    restorePromise = (async () => {
      restoreError.value = null
      let stored: unknown
      try {
        stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
      } catch {
        persist(null)
        return
      }
      if (!validSession(stored)) {
        persist(null)
        return
      }
      try {
        await post('/account/session/validate', {
          accessToken: stored.accessToken,
          clientToken: stored.clientToken,
        })
        if (revision === generation) session.value = stored
      } catch (error) {
        if (revision !== generation) return
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          try {
            const renewed = await post<AuthSession>('/account/session/refresh', {
              accessToken: stored.accessToken,
              clientToken: stored.clientToken,
            })
            if (revision === generation) replaceSession(renewed)
          } catch (refreshError) {
            if (revision !== generation) return
            if (refreshError instanceof ApiError && [401, 403].includes(refreshError.status)) {
              clear()
              notice.value = 'Tu sesión caducó. Iniciá sesión para continuar.'
            } else restoreError.value = refreshError
          }
        } else restoreError.value = error
      }
    })()
    return restorePromise
  }

  function acceptLogin(result: AuthSession) {
    if (!validSession(result))
      throw new ApiError('El servidor devolvió una sesión inválida.', 502, 'InvalidSession')
    generation++
    session.value = result
    skin.value = null
    profileLoaded.value = false
    account.value = null
    restoreError.value = null
    notice.value = ''
    persist(result)
  }

  async function migrateLegacy(identifier: string, password: string) {
    const result = await post<{ token: string }>('/migration/verify', { identifier, password })
    await startDiscord(result.token)
  }

  async function startDiscord(migrationToken?: string) {
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('')
    const challenge = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    try {
      sessionStorage.setItem(VERIFIER_KEY, verifier)
      if (migrationToken) sessionStorage.setItem(MIGRATION_KEY, migrationToken)
      else sessionStorage.removeItem(MIGRATION_KEY)
    } catch {
      throw new ApiError('Permití el almacenamiento de esta pestaña para entrar con Discord.')
    }
    const result = await post<{ url: string }>('/discord/start', { challenge })
    const destination = new URL(result.url)
    if (
      destination.origin !== 'https://discord.com' ||
      destination.pathname !== '/oauth2/authorize'
    )
      throw new ApiError('El servidor devolvió un enlace de Discord inválido.')
    window.location.assign(result.url)
  }

  async function finishDiscord(code: string) {
    clear()
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    const migrationToken = sessionStorage.getItem(MIGRATION_KEY)
    sessionStorage.removeItem(MIGRATION_KEY)
    sessionStorage.removeItem(VERIFIER_KEY)
    if (!verifier)
      throw new ApiError(
        'Volvé a iniciar sesión con Discord desde esta pestaña.',
        403,
        'DiscordStateExpired',
      )
    const result = await post<{ session?: AuthSession; registrationToken?: string }>(
      '/discord/exchange',
      { code, verifier, ...(migrationToken ? { migrationToken } : {}) },
    )
    if (result.session) acceptLogin(result.session)
    else if (!result.registrationToken)
      throw new ApiError('El servidor devolvió una respuesta inválida.')
    return result.registrationToken
  }

  async function registerDiscord(username: string, registrationToken: string) {
    const result = await post<{ session: AuthSession }>('/discord/register', {
      username,
      registrationToken,
    })
    acceptLogin(result.session)
  }

  async function loadProfile() {
    if (!session.value) return
    const id = session.value.selectedProfile.id,
      revision = generation
    const data = await request<FullProfile>(`/sessionserver/session/minecraft/profile/${id}`)
    if (revision !== generation) return
    if (!data || data.id !== id || !Array.isArray(data.properties))
      throw new ApiError('No se encontró tu perfil.', 404, 'ProfileMissing')
    skin.value = parseSkin(data)
    profileLoaded.value = true
  }

  async function skinRequest(options: RequestInit) {
    const current = session.value
    if (!current) throw new ApiError('Iniciá sesión para continuar.', 401, 'SessionExpired')
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${current.accessToken}`)
    try {
      await request(`/api/user/profile/${current.selectedProfile.id}/skin`, {
        ...options,
        headers,
      })
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        clear()
        notice.value = 'Tu sesión caducó. Iniciá sesión para continuar.'
      }
      throw error
    }
  }

  async function saveSkin(file: File, model: SkinModel) {
    const form = new FormData()
    form.set('file', file)
    form.set('model', model === 'slim' ? 'slim' : '')
    await skinRequest({ method: 'PUT', body: form })
    profileLoaded.value = false
  }

  async function deleteSkin() {
    await skinRequest({ method: 'DELETE' })
    skin.value = null
    profileLoaded.value = true
  }

  function replaceSession(value: AuthSession) {
    if (!validSession(value))
      throw new ApiError('El servidor devolvió una sesión inválida.', 502, 'InvalidSession')
    generation++
    session.value = value
    persist(value)
  }

  async function accountRequest<T>(path: string, body?: unknown): Promise<T> {
    if (!session.value)
      throw new ApiError('Iniciá sesión para continuar.', 401, 'SessionExpired')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.value.accessToken}`,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    try {
      return await request<T>(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clear()
        notice.value = 'Tu sesión caducó. Iniciá sesión para continuar.'
      }
      throw error
    }
  }

  async function loadAccount() {
    const revision = generation
    const details = await accountRequest<AccountDetails>('/account/me')
    if (revision === generation && session.value) account.value = details
  }
  async function changeUsername(username: string) {
    const result = await accountRequest<{ session: AuthSession }>('/account/username', {
      username,
    })
    replaceSession(result.session)
    account.value = null
  }
  async function generateLauncherToken() {
    return accountRequest<{ token: string; username: string; expiresAt: string }>(
      '/account/launcher-token',
      {},
    )
  }
  async function signoutAll() {
    await accountRequest('/account/signout-all', {})
    clear()
  }

  async function logout() {
    const token = session.value?.accessToken
    clear()
    if (token) {
      try {
        await post('/account/session/logout', { accessToken: token })
      } catch {
        notice.value =
          'Cerramos la sesión en esta pestaña. El servidor no pudo confirmar la revocación.'
        return
      }
    }
    notice.value = 'Sesión cerrada.'
  }

  return {
    session,
    skin,
    profile,
    profileLoaded,
    account,
    restoreError,
    notice,
    restore,
    startDiscord,
    migrateLegacy,
    finishDiscord,
    registerDiscord,
    logout,
    loadProfile,
    saveSkin,
    deleteSkin,
    loadAccount,
    changeUsername,
    generateLauncherToken,
    signoutAll,
  }
})
