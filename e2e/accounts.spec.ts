import { test, expect } from '@playwright/test'
import { login, mockApi, png } from './fixtures'

test('signs in through Discord and generates a token without persisting it', async ({
  page,
}) => {
  const api = await mockApi(page)
  await login(page)
  await expect(page.getByRole('heading', { name: 'Hola, TestPlayer.' })).toBeVisible()
  await expect(page.locator('.launcher-token')).toHaveText('1'.repeat(64))
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(
    '1'.repeat(64),
  )
  expect(page.url()).not.toContain('code=')
  await page.getByRole('button', { name: 'Generar otro token' }).click()
  await expect(page.locator('.launcher-token')).toHaveText('2'.repeat(64))
  expect(api.tokens).toBe(2)
  await page.reload()
  await expect(page.locator('.launcher-token')).toHaveCount(0)
})

test('registers a new Discord identity by choosing a player name', async ({ page }) => {
  const api = await mockApi(page, { newAccount: true })
  await page.goto('/register')
  await page.getByRole('button', { name: 'Continuar con Discord' }).click()
  await expect(page.getByRole('heading', { name: 'Elegí tu nombre' })).toBeVisible()
  await page.getByLabel('Nombre de Minecraft').fill('NewPlayer')
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hola, NewPlayer.' })).toBeVisible()
  expect(api.registrations).toBe(1)
})

test('explains the server membership requirement without creating a session', async ({
  page,
}) => {
  await mockApi(page, { loginError: 'membership' })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continuar con Discord' }).click()
  await expect(page.getByRole('alert')).toContainText('Tenés que estar en el servidor')
  await expect(page.getByRole('link', { name: 'Unirme al servidor' })).toHaveAttribute(
    'href',
    'https://discord.com/invite/7VaqSrPukm',
  )
  expect(
    await page.evaluate(() => sessionStorage.getItem('cubic-discord-session-v2')),
  ).toBeNull()
})

test('rejects a copied OAuth callback without the initiating tab secret', async ({ page }) => {
  await mockApi(page)
  await page.goto('/login#code=' + 'c'.repeat(64))
  await expect(page.getByRole('alert')).toContainText('desde esta pestaña')
  expect(page.url()).not.toContain('code=')
})

test('manages the player name without passwords and retains UUID and history', async ({
  page,
}) => {
  await mockApi(page)
  await login(page)
  await page.getByRole('button', { name: 'Cambiar nombre', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Cambiar nombre de Minecraft' })
  await modal.getByLabel('Nuevo nombre').fill('NewPlayer')
  await modal.getByRole('button', { name: 'Guardar nombre' }).click()
  await expect(modal).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Hola, NewPlayer.' })).toBeVisible()
  await expect(page.locator('.name-history')).toContainText('TestPlayer')
  await expect(page.locator('.profile-data code')).toHaveText('b'.repeat(32))
  await expect(page.getByRole('button', { name: 'Cambiar contraseña' })).toHaveCount(0)
})

test('redirects protected routes, retains themes and fits mobile screens', async ({ page }) => {
  await mockApi(page)
  await page.goto('/account/skin')
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByLabel('Tema de la interfaz').selectOption('dark')
  await expect(page.locator('html')).toHaveClass('dark')
  await page.reload()
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((el) => el.clientWidth),
  )
})

test('shows a connection failure when Discord login cannot start', async ({ page }) => {
  await page.route('https://auth.cubiclauncher.org/**', (route) => route.abort('failed'))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continuar con Discord' }).click()
  await expect(page.getByRole('alert')).toContainText('No se pudo conectar con CubAuth.')
})

test('loads a real WebGL viewer, previews locally, saves the model and restores the session', async ({
  page,
}, info) => {
  const api = await mockApi(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page)
  await expect(page.getByRole('heading', { name: 'Hola, TestPlayer.' })).toBeVisible()
  await page.getByRole('link', { name: 'Apariencia', exact: true }).click()
  await expect(page.locator('[data-viewer-state="ready"]')).toBeVisible()
  await page
    .getByLabel('Elegir archivo de skin')
    .setInputFiles({ name: 'my-skin.png', mimeType: 'image/png', buffer: png() })
  await expect(page.getByText('my-skin.png')).toBeVisible()
  await expect(page.getByText('Cambios sin guardar', { exact: true })).toBeVisible()
  expect(api.uploads).toBe(0)
  await page.getByRole('radio', { name: /Slim/ }).check()
  await page.getByLabel('Animación', { exact: true }).selectOption('walk')
  await page.getByRole('button', { name: 'Pausar animación', exact: true }).click()
  await page.getByRole('button', { name: 'Acercar personaje' }).click()
  await page.getByRole('button', { name: 'Restablecer cámara' }).click()
  await page.getByRole('button', { name: 'Guardar skin', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Skin guardada' })).toBeVisible()
  expect(api.uploads).toBe(1)
  expect(api.model).toBe('slim')
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible()
  await page.getByLabel('Tema de la interfaz').selectOption('dark')
  await page.screenshot({ path: info.outputPath('editor-dark.png'), fullPage: true })
  await page.getByLabel('Tema de la interfaz').selectOption('light')
  await page.screenshot({ path: info.outputPath('editor-light.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hola, TestPlayer.' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Slim/ })).toBeChecked()
  expect(errors).toEqual([])
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(api.invalidations).toBe(1)
  expect(
    await page.evaluate(() => sessionStorage.getItem('cubic-discord-session-v2')),
  ).toBeNull()
})

test('validates PNG dimensions and enforces the classic model for legacy skins', async ({
  page,
}) => {
  const api = await mockApi(page)
  await login(page)
  await page.getByRole('link', { name: 'Apariencia', exact: true }).click()
  await page.getByLabel('Elegir archivo de skin').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a png'),
  })
  await expect(page.getByRole('alert')).toContainText('PNG válida')
  await page
    .getByLabel('Elegir archivo de skin')
    .setInputFiles({ name: 'legacy.png', mimeType: 'image/png', buffer: png(32) })
  await expect(page.getByRole('radio', { name: /Slim/ })).toBeDisabled()
  await expect(page.getByRole('radio', { name: /Clásico/ })).toBeChecked()
  await page.getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guardar skin', exact: true })).toBeDisabled()
  expect(api.uploads).toBe(0)
})

test('animates the confirmation dialog, restores focus and deletes only after confirmation', async ({
  page,
}, info) => {
  const api = await mockApi(page)
  await login(page)
  await page.getByRole('link', { name: 'Apariencia', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Quitar skin', exact: true })
  await trigger.click()
  const modal = page.getByRole('dialog', { name: 'Quitar tu skin' })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(api.deletes).toBe(0)
  await trigger.click()
  await page.screenshot({ path: info.outputPath('animated-modal.png'), animations: 'disabled' })
  await modal.getByRole('button', { name: 'Sí, quitar skin', exact: true }).click()
  await expect(modal).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Quitamos la skin' })).toBeVisible()
  expect(api.deletes).toBe(1)
})

test('respects reduced motion and keeps uploads available without WebGL', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes('webgl')) return null
      return Reflect.apply(original, this, args)
    } as typeof original
  })
  await mockApi(page)
  await login(page)
  await page.getByRole('link', { name: 'Apariencia', exact: true }).click()
  await expect(page.locator('[data-viewer-state="fallback"]')).toBeVisible()
  await expect(page.getByText('El visor 3D no está disponible', { exact: false })).toBeVisible()
  await page
    .getByLabel('Elegir archivo de skin')
    .setInputFiles({ name: 'skin.png', mimeType: 'image/png', buffer: png() })
  await expect(page.getByRole('button', { name: 'Guardar skin', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Descartar', exact: true }).click()
  await page.getByRole('button', { name: 'Quitar skin', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(
    await page
      .getByRole('dialog')
      .evaluate((el) =>
        el
          .getAnimations()
          .every(
            (a) => Number(a.effect?.getTiming().duration) === 0 || a.playState === 'finished',
          ),
      ),
  ).toBe(true)
})
