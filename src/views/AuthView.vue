<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhDiscordLogo,
  PhArrowRight,
  PhShieldCheck,
  PhPaintBrush,
  PhFingerprint,
  PhLinkSimple,
  PhCaretDown,
} from '@phosphor-icons/vue'
import CubicLogo from '@/components/CubicLogo.vue'
import NoticeMessage from '@/components/NoticeMessage.vue'
import { ApiError, errorInfo, request, type ServerMetadata } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore(),
  router = useRouter()
const busy = ref(false),
  username = ref(''),
  registrationToken = ref('')
const failure = ref({ message: '', diagnostic: '' })
const membershipRequired = ref(false)
const migrationOpen = ref(false)
const migrationFailure = ref({ message: '', diagnostic: '' })
const legacyIdentifier = ref('')
const legacyPassword = ref('')
const legacyIdentifierField = ref<HTMLInputElement | null>(null)
async function toggleMigration() {
  migrationOpen.value = !migrationOpen.value
  migrationFailure.value = { message: '', diagnostic: '' }
  if (migrationOpen.value) {
    await nextTick()
    legacyIdentifierField.value?.focus()
  }
}
function closeMigration() {
  migrationOpen.value = false
  migrationFailure.value = { message: '', diagnostic: '' }
}
async function migrate() {
  busy.value = true
  migrationFailure.value = { message: '', diagnostic: '' }
  try {
    const password = legacyPassword.value
    legacyPassword.value = ''
    await auth.migrateLegacy(legacyIdentifier.value.trim(), password)
  } catch (error) {
    migrationFailure.value = errorInfo(error)
  } finally {
    busy.value = false
  }
}
const invite = ref('https://discord.com/invite/7VaqSrPukm')
const errors: Record<string, string> = {
  DiscordLoginCancelled: 'Cancelaste el inicio de sesión con Discord. Podés reintentarlo.',
  DiscordStateExpired: 'El intento de ingreso venció. Iniciá sesión de nuevo.',
  AccountBanned: 'Tu cuenta está deshabilitada. Contactá al equipo de CubicLauncher.',
}
function setFailure(error: unknown) {
  failure.value = errorInfo(error)
  membershipRequired.value = error instanceof ApiError && error.code === 'DiscordMembershipRequired'
}
async function start() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  membershipRequired.value = false
  try {
    await auth.startDiscord()
  } catch (error) {
    setFailure(error)
    busy.value = false
  }
}
async function register() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  membershipRequired.value = false
  try {
    await auth.registerDiscord(username.value.trim(), registrationToken.value)
    registrationToken.value = ''
    await router.replace('/account')
  } catch (error) {
    setFailure(error)
    if (error instanceof ApiError && error.code === 'DiscordStateExpired')
      registrationToken.value = ''
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const code = params.get('code'),
    error = params.get('error')
  // Remove the short-lived ticket before loading anything else or displaying errors.
  if (code || error) history.replaceState(history.state, '', window.location.pathname)
  if (error)
    failure.value = {
      message: errors[error] ?? 'No se pudo completar el inicio de sesión con Discord. Reintentá.',
      diagnostic: '',
    }
  if (code) {
    busy.value = true
    try {
      registrationToken.value = (await auth.finishDiscord(code)) ?? ''
      if (auth.session) await router.replace('/account')
    } catch (error) {
      setFailure(error)
    } finally {
      busy.value = false
    }
  }
  try {
    const metadata = await request<ServerMetadata>('/')
    if (metadata.discordInviteUrl) {
      const url = new URL(metadata.discordInviteUrl)
      if (url.protocol === 'https:' && ['discord.com', 'discord.gg'].includes(url.hostname))
        invite.value = url.href
    }
  } catch {
    /* Keep the default invitation; login reports actionable failures. */
  }
})
</script>

<template>
  <div class="container auth-page">
    <div class="auth-frame">
      <div class="auth-frame-inner">
        <section class="auth-showcase" aria-label="CubicLauncher Accounts">
          <div class="showcase-content">
            <span class="eyebrow light-eyebrow">CUBICLAUNCHER ACCOUNTS</span>
            <CubicLogo class="showcase-logo" />
            <h2>Cuenta de Minecraft<br />y acceso al launcher.</h2>
            <p>Perfil, skin y acceso al launcher en una sola cuenta.</p>
            <div class="showcase-features">
              <span><PhFingerprint :size="18" /> UUID y nombre persistentes</span>
              <span><PhPaintBrush :size="18" /> Editor de skin con vista 3D</span>
              <span><PhShieldCheck :size="18" /> Token de acceso al launcher</span>
            </div>
          </div>
          <span class="showcase-caption">CubicLauncher · Gestión de cuentas</span>
        </section>
        <section class="auth-form-panel">
          <span class="eyebrow">CUENTA CUBICLAUNCHER</span>
          <h1>{{ registrationToken ? 'Elegí tu nombre' : 'Iniciar sesión con Discord' }}</h1>
          <p class="muted auth-description">
            {{
              registrationToken
                ? 'Este nombre se usará en Minecraft y quedará vinculado a tu cuenta de Discord.'
                : 'Ingresá con Discord para administrar tu cuenta y generar el token del launcher.'
            }}
          </p>
          <NoticeMessage v-if="auth.notice" :message="auth.notice" />
          <NoticeMessage kind="error" v-bind="failure" />
          <div class="discord-requirement" :class="{ attention: membershipRequired }">
            <span class="discord-requirement-icon"><PhDiscordLogo :size="17" /></span>
            <div class="discord-requirement-copy">
              <strong>Requisito de acceso</strong>
              <p>Es necesario estar en el servidor de CubicLauncher para ingresar.</p>
            </div>
            <a class="button button-small" :href="invite" target="_blank" rel="noopener noreferrer"
              >Unirme al servidor</a
            >
          </div>
          <form v-if="registrationToken" @submit.prevent="register">
            <fieldset :disabled="busy">
              <label class="field" for="username"
                >Nombre de Minecraft
                <input
                  id="username"
                  v-model="username"
                  autocomplete="username"
                  pattern="[A-Za-z0-9_]{3,16}"
                  minlength="3"
                  maxlength="16"
                  placeholder="TuNombre"
                  required
                />
                <span class="field-hint">3–16 letras, números o guiones bajos.</span>
              </label>
              <button class="button button-primary button-full" type="submit">
                {{ busy ? 'Creando cuenta…' : 'Crear cuenta' }}<PhArrowRight :size="16" />
              </button>
            </fieldset>
          </form>
          <button v-else class="button button-primary button-full" :disabled="busy" @click="start">
            <PhDiscordLogo :size="20" />{{ busy ? 'Conectando…' : 'Continuar con Discord' }}
          </button>
          <template v-if="!registrationToken">
            <div class="auth-divider" aria-hidden="true"><span>o</span></div>
            <section class="migration">
              <button
                type="button"
                class="migration-toggle"
                :aria-expanded="migrationOpen"
                aria-controls="migration-panel"
                @click="toggleMigration"
              >
                <span class="migration-toggle-icon"><PhLinkSimple :size="17" /></span>
                <span class="migration-toggle-copy">
                  <strong>Migrar cuenta anterior</strong>
                  <small>Vinculá tu perfil del sistema anterior a Discord.</small>
                </span>
                <PhCaretDown class="migration-chevron" :size="16" aria-hidden="true" />
              </button>
              <Transition name="migration-panel">
                <div v-if="migrationOpen" id="migration-panel" class="migration-panel">
                  <form class="migration-form" @submit.prevent="migrate">
                    <fieldset :disabled="busy">
                      <label class="field" for="legacy-identifier"
                        >Usuario o correo anterior
                        <input
                          id="legacy-identifier"
                          ref="legacyIdentifierField"
                          v-model="legacyIdentifier"
                          autocomplete="username"
                          autocapitalize="none"
                          spellcheck="false"
                          maxlength="254"
                          required
                        />
                      </label>
                      <label class="field" for="legacy-password"
                        >Contraseña anterior
                        <input
                          id="legacy-password"
                          v-model="legacyPassword"
                          type="password"
                          autocomplete="current-password"
                          required
                        />
                      </label>
                      <NoticeMessage
                        kind="info"
                        message="La verificación vence a los 10 minutos. Si el Discord ya tiene una cuenta, se reemplaza por la anterior y se cierran sus sesiones."
                      />
                      <NoticeMessage kind="error" v-bind="migrationFailure" />
                      <div class="migration-actions">
                        <button class="button button-primary" type="submit">
                          <PhDiscordLogo :size="18" />{{
                            busy ? 'Verificando…' : 'Verificar y vincular'
                          }}
                        </button>
                        <button
                          class="button"
                          type="button"
                          :disabled="busy"
                          @click="closeMigration"
                        >
                          Cancelar
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </div>
              </Transition>
            </section>
          </template>
          <p v-if="registrationToken" class="auth-footnote">
            Al crear tu cuenta, aceptás los
            <a href="https://dev.cubiclauncher.org/docs/es-ES/Legal/terms">términos de uso.</a>
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
