<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhDiscordLogo,
  PhArrowRight,
  PhShieldCheck,
  PhPaintBrush,
  PhFingerprint,
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
const migrationOpen = ref(false)
const legacyIdentifier = ref('')
const legacyPassword = ref('')
async function migrate() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  try {
    const password = legacyPassword.value
    legacyPassword.value = ''
    await auth.migrateLegacy(legacyIdentifier.value.trim(), password)
  } catch (error) {
    failure.value = errorInfo(error)
    busy.value = false
  }
}
const invite = ref('https://discord.com/invite/7VaqSrPukm')
const errors: Record<string, string> = {
  DiscordLoginCancelled: 'Cancelaste el inicio de sesión. Podés volver a intentarlo.',
  DiscordStateExpired: 'El intento de ingreso venció. Iniciá sesión de nuevo.',
  AccountBanned: 'Tu cuenta está deshabilitada. Contactá al equipo de CubicLauncher.',
}
async function start() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  try {
    await auth.startDiscord()
  } catch (error) {
    failure.value = errorInfo(error)
    busy.value = false
  }
}
async function register() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  try {
    await auth.registerDiscord(username.value.trim(), registrationToken.value)
    registrationToken.value = ''
    await router.replace('/account')
  } catch (error) {
    failure.value = errorInfo(error)
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
      message:
        errors[error] ?? 'No pudimos completar el ingreso con Discord. Intentá de nuevo.',
      diagnostic: '',
    }
  if (code) {
    busy.value = true
    try {
      registrationToken.value = (await auth.finishDiscord(code)) ?? ''
      if (auth.session) await router.replace('/account')
    } catch (error) {
      failure.value = errorInfo(error)
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
            <h2>Tu perfil de Minecraft,<br />a tu manera.</h2>
            <p>Entrá con Discord, elegí tu nombre y preparate para jugar.</p>
            <div class="showcase-features">
              <span><PhFingerprint :size="18" /> Tu nombre y su historial</span>
              <span><PhPaintBrush :size="18" /> Skins con vista previa en 3D</span>
              <span><PhShieldCheck :size="18" /> Acceso con tu cuenta de Discord</span>
            </div>
          </div>
          <span class="showcase-caption">CubicLauncher · Gestión de cuentas</span>
        </section>
        <section class="auth-form-panel">
          <span class="eyebrow">TU ESPACIO EN CUBIC</span>
          <h1>{{ registrationToken ? 'Elegí tu nombre' : 'Iniciar sesión con Discord' }}</h1>
          <p class="muted auth-description">
            {{
              registrationToken
                ? 'Este será tu nombre en Minecraft. Tu cuenta queda vinculada a Discord.'
                : 'Entrá o creá tu cuenta. Después podrás generar el token que vas a usar como contraseña en el launcher.'
            }}
          </p>
          <NoticeMessage v-if="auth.notice" :message="auth.notice" />
          <NoticeMessage kind="error" v-bind="failure" />
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
          <button
            v-else
            class="button button-primary button-full"
            :disabled="busy"
            @click="start"
          >
            <PhDiscordLogo :size="20" />{{ busy ? 'Conectando…' : 'Continuar con Discord' }}
          </button>
          <p class="auth-footnote">
            <a :href="invite" target="_blank" rel="noopener noreferrer">Comunidad de Discord</a>
          </p>
          <p class="auth-footnote">
            Cambiamos el sistema de cuentas. Si ya tenías una, vinculala a Discord para
            conservar tu UUID, nombre, skin e historial.
          </p>
          <template v-if="!registrationToken">
            <button class="button button-full" :disabled="busy" @click="migrationOpen = !migrationOpen">
              {{ migrationOpen ? 'Cerrar migración' : 'Vincular mi cuenta anterior' }}
            </button>
            <form v-if="migrationOpen" @submit.prevent="migrate">
              <fieldset :disabled="busy">
                <label class="field" for="legacy-identifier">Usuario o correo anterior
                  <input id="legacy-identifier" v-model="legacyIdentifier" autocomplete="username" maxlength="254" required />
                </label>
                <label class="field" for="legacy-password">Contraseña anterior
                  <input id="legacy-password" v-model="legacyPassword" type="password" autocomplete="current-password" required />
                </label>
                <p class="auth-footnote">Después de verificarla, autorizá Discord dentro de 10 minutos. Si ese Discord ya tiene una cuenta nueva, se reemplazará por la anterior y se cerrarán sus sesiones.</p>
                <button class="button button-primary button-full" type="submit">
                  {{ busy ? 'Verificando…' : 'Verificar y vincular con Discord' }}
                </button>
              </fieldset>
            </form>
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
