import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../auth'

const key = 'cubic-discord-session-v2'
const session = {
  accessToken: 'a'.repeat(64),
  clientToken: 'test-client',
  selectedProfile: { id: 'b'.repeat(32), name: 'TestPlayer' },
}
beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Discord session lifecycle', () => {
  it('exchanges a callback ticket using the initiating tab secret, then removes that secret', async () => {
    sessionStorage.setItem('cubic-discord-verifier', 'f'.repeat(64))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ session }))
    vi.stubGlobal('fetch', fetcher)
    await useAuthStore().finishDiscord('c'.repeat(64))
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      code: 'c'.repeat(64),
      verifier: 'f'.repeat(64),
    })
    expect(sessionStorage.getItem('cubic-discord-verifier')).toBeNull()
    expect(useAuthStore().session).toEqual(session)
    expect(sessionStorage.getItem(key)).not.toContain('verifier')
  })
  it('rejects copied callback links without contacting the server', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    await expect(useAuthStore().finishDiscord('c'.repeat(64))).rejects.toMatchObject({
      code: 'DiscordStateExpired',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not create a session until a new Discord user chooses a player name', async () => {
    sessionStorage.setItem('cubic-discord-verifier', 'f'.repeat(64))
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ registrationToken: 'e'.repeat(64) }))
        .mockResolvedValueOnce(Response.json({ session })),
    )
    const store = useAuthStore()
    expect(await store.finishDiscord('c'.repeat(64))).toBe('e'.repeat(64))
    expect(store.session).toBeNull()
    await store.registerDiscord('TestPlayer', 'e'.repeat(64))
    expect(store.session).toEqual(session)
  })
  it('ignores old email sessions and validates only new web sessions', async () => {
    sessionStorage.setItem('cubic-account-session-v1', JSON.stringify(session))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    await useAuthStore().restore()
    expect(fetcher).not.toHaveBeenCalled()
    sessionStorage.setItem(key, JSON.stringify(session))
    await useAuthStore().restore(true)
    expect(useAuthStore().session).toEqual(session)
    expect(fetcher.mock.calls[0]?.[0]).toContain('/account/session/validate')
  })
  it('keeps launcher credentials out of browser storage', async () => {
    sessionStorage.setItem(key, JSON.stringify(session))
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          token: 'e'.repeat(64),
          username: 'TestPlayer',
          expiresAt: '2027-01-01T00:00:00Z',
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    const store = useAuthStore()
    await store.restore()
    expect((await store.generateLauncherToken()).token).toBe('e'.repeat(64))
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer ' + session.accessToken,
    )
    expect(JSON.stringify(sessionStorage)).not.toContain('e'.repeat(64))
  })
  it('clears expired sessions but preserves the saved candidate on a temporary outage', async () => {
    sessionStorage.setItem(key, JSON.stringify(session))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: 'ServiceUnavailable' }, { status: 503 })),
    )
    const store = useAuthStore()
    await store.restore()
    expect(store.session).toBeNull()
    expect(store.restoreError).toBeTruthy()
    expect(sessionStorage.getItem(key)).not.toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    await store.restore(true)
    expect(sessionStorage.getItem(key)).toBeNull()
  })
  it('clears revoked sessions after a protected skin operation', async () => {
    sessionStorage.setItem(key, JSON.stringify(session))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    const store = useAuthStore()
    await store.restore()
    await expect(store.deleteSkin()).rejects.toMatchObject({ status: 401 })
    expect(store.session).toBeNull()
  })
  it('removes local credentials even when logout cannot reach the server', async () => {
    sessionStorage.setItem(key, JSON.stringify(session))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockRejectedValueOnce(new TypeError('offline')),
    )
    const store = useAuthStore()
    await store.restore()
    await store.logout()
    expect(store.session).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    expect(store.notice).toContain('revocación')
  })
})
