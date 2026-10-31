import { getActivePinia } from 'pinia'
import { useNotificationsStore } from '@/stores/notifications'

export const API_URL = (
  import.meta.env.VITE_AUTH_API_URL || 'https://auth.cubiclauncher.org'
).replace(/\/$/, '')
const REQUEST_BASE = import.meta.env.DEV ? '/api' : API_URL

export interface PlayerProfile {
  id: string
  name: string
}
export interface AuthSession {
  accessToken: string
  clientToken: string
  selectedProfile: PlayerProfile
}
export type SkinModel = 'default' | 'slim'
export interface PlayerSkin {
  url: string
  model: SkinModel
}
export interface AccountDetails {
  discordEmail?: string | null
  discordId: string
  createdAt: string
  nameHistory: { previousName: string; newName: string; changedAt: string }[]
  historyTotal: number
}
export interface FullProfile extends PlayerProfile {
  properties: { name: string; value: string; signature?: string }[]
}
export interface ServerMetadata {
  meta: { serverName?: string; registrationEnabled?: boolean }
  discordInviteUrl?: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = 'ConnectionError',
    public diagnostic = '',
    public presentation: 'inline' | 'toast' = 'inline',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const messages: Record<string, string> = {
  MigrationCredentialsInvalid: 'El usuario o la contraseña anterior no son correctos.',
  MigrationExpired: 'La verificación venció. Volvé a verificar tu cuenta anterior.',
  MigrationUnavailable: 'No pudimos consultar las cuentas anteriores. Intentá de nuevo.',
  MigrationProfileMissing: 'No encontramos el perfil de tu cuenta anterior.',
  LegacyAlreadyLinked: 'Esta cuenta anterior ya está vinculada a otro Discord.',
  DiscordLoginFailed: 'No se pudo autorizar el acceso con Discord. Volvé a intentarlo.',
  DiscordLoginCancelled: 'Cancelaste el inicio de sesión con Discord.',
  DiscordStateExpired: 'Este intento de ingreso venció. Volvé a iniciar sesión con Discord.',
  DiscordUnavailable: 'Discord no está disponible en este momento. Volvé a intentarlo.',
  RegistrationDisabled: 'Los registros están cerrados por el momento.',
  AccountBanned:
    'Tu cuenta está suspendida. Contactá al equipo de CubicLauncher si necesitás ayuda.',
  TooManyRequests: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.',
  ConfigurationError: 'El servicio todavía necesita configuración. Contactá al administrador.',
  DatabaseFunctionMissing: 'La base de datos del servicio todavía no está lista.',
  UsernameTaken: 'Ese nombre de Minecraft ya está en uso.',
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${REQUEST_BASE}${path}`, {
      ...options,
      credentials: 'omit',
      signal: options.signal ?? AbortSignal.timeout(20_000),
    })
  } catch {
    const message = 'No se pudo conectar con CubAuth.'
    const pinia = getActivePinia()
    if (pinia) useNotificationsStore(pinia).showConnectionError(message)
    throw new ApiError(
      message,
      0,
      'ConnectionError',
      'Si el problema continúa, comprobá que el Worker permita el origen de esta web mediante CORS.',
      'toast',
    )
  }
  let body: unknown = null
  if (response.status !== 204) {
    try {
      body = await response.json()
    } catch {
      throw new ApiError(
        'El servidor devolvió una respuesta inesperada.',
        response.status,
        'InvalidResponse',
        `HTTP ${response.status}. Si es un bloqueo de Cloudflare, revisá las reglas del subdominio de autenticación.`,
      )
    }
  }
  if (!response.ok) {
    const error = (body ?? {}) as {
      error?: string
      errorMessage?: string
      details?: { operation?: string; upstreamStatus?: number; upstreamCode?: string }
    }
    const code = error.error ?? 'RequestFailed'
    let message = messages[code] ?? error.errorMessage ?? 'No se pudo completar la operación.'
    const accountBlocked =
      code === 'AccountBanned' || code.startsWith('Discord') || code.startsWith('Migration') || code === 'RegistrationDisabled'
    if (accountBlocked) {
      message = messages[code] ?? error.errorMessage ?? message
    } else if (path === '/authserver/authenticate' && response.status === 403) {
      message = 'El token no es válido, ya se usó o venció. Generá otro desde la web.'
    } else if (
      (response.status === 401 || response.status === 403) &&
      path !== '/account/register'
    ) {
      message = 'Tu sesión ya no es válida. Volvé a iniciar sesión.'
    } else if (response.status >= 500 && !messages[code]) {
      message = 'El servicio no está disponible en este momento. Intentá de nuevo más tarde.'
    }
    const details = error.details
    const diagnostic = [
      !accountBlocked && error.errorMessage !== message ? error.errorMessage : undefined,
      details?.operation,
      details?.upstreamStatus ? `HTTP ${details.upstreamStatus}` : undefined,
      details?.upstreamCode,
    ]
      .filter(Boolean)
      .join(' · ')
    throw new ApiError(message, response.status, code, diagnostic)
  }
  return body as T
}

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export function parseSkin(profile: FullProfile): PlayerSkin | null {
  const property = profile.properties.find((item) => item.name === 'textures')
  if (!property) return null
  try {
    const json = JSON.parse(atob(property.value)) as {
      textures?: { SKIN?: { url?: unknown; metadata?: { model?: string } } }
    }
    const skin = json.textures?.SKIN
    if (!skin) return null
    if (typeof skin.url !== 'string') throw new Error('Invalid URL')
    const url = new URL(skin.url)
    const localDevelopment =
      import.meta.env.DEV &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.origin === new URL(API_URL).origin
    if (url.username || url.password || (url.protocol !== 'https:' && !localDevelopment))
      throw new Error('Invalid URL')
    return { url: skin.url, model: skin.metadata?.model === 'slim' ? 'slim' : 'default' }
  } catch {
    throw new ApiError(
      'No se pudo interpretar la skin guardada en tu perfil.',
      502,
      'InvalidProfile',
    )
  }
}

export function errorInfo(error: unknown): { message: string; diagnostic: string } {
  if (error instanceof ApiError && error.presentation === 'toast')
    return { message: '', diagnostic: '' }
  return error instanceof ApiError
    ? { message: error.message, diagnostic: error.diagnostic }
    : {
        message: error instanceof Error ? error.message : 'Ocurrió un error inesperado.',
        diagnostic: '',
      }
}
