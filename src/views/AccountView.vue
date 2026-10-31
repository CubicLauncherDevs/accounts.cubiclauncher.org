<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  PhUserCircle,
  PhDiscordLogo,
  PhClockCounterClockwise,
  PhArrowRight,
  PhKey,
} from '@phosphor-icons/vue'
import { errorInfo } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import CopyButton from '@/components/CopyButton.vue'
import NoticeMessage from '@/components/NoticeMessage.vue'
import AnimatedModal from '@/components/AnimatedModal.vue'

const auth = useAuthStore()
const route = useRoute(),
  router = useRouter()
const busy = ref(false),
  loading = ref(false),
  editOpen = ref(false),
  nextName = ref('')
const failure = ref({ message: '', diagnostic: '' }),
  success = ref('')
const credential = ref<{ token: string; username: string; expiresAt: string } | null>(null)
let expiryTimer: ReturnType<typeof setTimeout> | undefined
const tokenCopied = ref(false),
  tokenReveal = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copyToken() {
  if (!credential.value) return
  try {
    await navigator.clipboard.writeText(credential.value.token)
    tokenCopied.value = true
    tokenReveal.value = false
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (tokenCopied.value = false), 2500)
  } catch {
    tokenReveal.value = true
  }
}
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value))
async function load() {
  loading.value = true
  try {
    await auth.loadAccount()
  } catch (error) {
    failure.value = errorInfo(error)
  } finally {
    loading.value = false
  }
}
async function generate() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  try {
    credential.value = await auth.generateLauncherToken()
    tokenCopied.value = false
    tokenReveal.value = false
    clearTimeout(expiryTimer)
    expiryTimer = setTimeout(
      () => {
        credential.value = null
      },
      Math.max(0, new Date(credential.value.expiresAt).getTime() - Date.now()),
    )
  } catch (error) {
    failure.value = errorInfo(error)
  } finally {
    busy.value = false
  }
}
async function rename() {
  busy.value = true
  failure.value = { message: '', diagnostic: '' }
  try {
    await auth.changeUsername(nextName.value.trim())
    credential.value = null
    editOpen.value = false
    success.value =
      'Nombre actualizado. Conservás tu UUID; volvé a entrar en el launcher para actualizar el nombre.'
    await load()
  } catch (error) {
    failure.value = errorInfo(error)
  } finally {
    busy.value = false
  }
}
async function signoutAll() {
  busy.value = true
  try {
    await auth.signoutAll()
  } catch (error) {
    failure.value = errorInfo(error)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  const generateAfterLogin = route.query.launcher === '1'
  if (generateAfterLogin) await router.replace('/account')
  await load()
  if (generateAfterLogin && auth.session) await generate()
})
onBeforeUnmount(() => {
  clearTimeout(expiryTimer)
  clearTimeout(copyTimer)
})
</script>

<template>
  <div class="account-notices">
    <NoticeMessage kind="error" v-bind="failure" /><NoticeMessage
      kind="success"
      :message="success"
    />
  </div>
  <div class="settings-grid">
    <section class="panel identity-panel">
      <div class="panel-heading">
        <PhUserCircle :size="22" />
        <div>
          <h2>Tu perfil</h2>
          <p>Tu identidad de Minecraft.</p>
        </div>
      </div>
      <div class="identity-name">
        <span class="profile-initial">{{ auth.profile?.name.slice(0, 1).toUpperCase() }}</span
        ><strong>{{ auth.profile?.name }}</strong>
        <button
          class="button button-small"
          :disabled="busy"
          @click="
            nextName = auth.profile?.name ?? '';
            editOpen = true
          "
        >
          Cambiar nombre
        </button>
      </div>
      <dl class="profile-data">
        <div>
          <dt>UUID permanente</dt>
          <dd class="copy-row">
            <code>{{ auth.profile?.id }}</code
            ><CopyButton :value="auth.profile?.id ?? ''" label="Copiar UUID" />
          </dd>
        </div>
        <div>
          <dt>Discord vinculado</dt>
          <dd>
            <PhDiscordLogo :size="16" />
            {{ auth.account?.discordId ?? (loading ? 'Cargando…' : '—') }}
          </dd>
        </div>
        <div v-if="auth.account?.createdAt">
          <dt>Cuenta creada</dt>
          <dd>{{ formatDate(auth.account.createdAt) }}</dd>
        </div>
      </dl>
      <div class="profile-skin-link">
        <div>
          <strong>Tu skin, tu estilo.</strong>
          <p>Personalizá tu apariencia en el editor 3D.</p>
        </div>
        <RouterLink to="/account/skin" class="button"
          >Personalizar <PhArrowRight :size="14"
        /></RouterLink>
      </div>
    </section>
    <section class="panel security-panel">
      <div class="panel-heading">
        <PhKey :size="22" />
        <div>
          <h2>Entrar al launcher</h2>
          <p>Generá un token y pegalo como contraseña.</p>
        </div>
      </div>
      <p>
        Usá tu nombre de Minecraft y este token en el launcher. Vence en una hora y solo se
        puede usar una vez. La sesión del juego continúa después de usarlo.
      </p>
      <button class="button button-primary button-full" :disabled="busy" @click="generate">
        {{
          busy
            ? 'Un momento…'
            : credential
              ? 'Generar otro token'
              : 'Generar token para el launcher'
        }}
      </button>
      <div v-if="credential" class="launcher-credential" aria-live="polite">
        <label>Usuario</label>
        <div class="copy-row">
          <code>{{ credential.username }}</code
          ><CopyButton :value="credential.username" label="Copiar usuario" />
        </div>
        <label>Token (contraseña)</label>
        <button
          type="button"
          class="launcher-token-box"
          :class="{ copied: tokenCopied, revealed: tokenReveal }"
          :aria-label="tokenCopied ? 'Token copiado' : 'Copiar token'"
          :title="tokenReveal ? 'Seleccioná el texto para copiarlo' : tokenCopied ? 'Copiado al portapapeles' : 'Copiar token'"
          @click="copyToken"
        >
          <code class="launcher-token">{{ credential.token }}</code>
          <span class="launcher-token-action" aria-live="polite">{{
            tokenReveal ? 'Copiar a mano' : tokenCopied ? 'Copiado ✓' : 'Copiar'
          }}</span>
        </button>
        <p class="field-hint">
          Vence a las
          {{
            new Date(credential.expiresAt).toLocaleTimeString('es', {
              hour: '2-digit',
              minute: '2-digit',
            })
          }}. Generar otro invalida el anterior.
        </p>
      </div>
      <p class="field-hint">
        El token solo se muestra en esta página.
      </p>
      <button class="button button-small" :disabled="busy" @click="signoutAll">
        Cerrar todas las sesiones
      </button>
    </section>
    <section class="panel history-panel">
      <div class="panel-heading">
        <PhClockCounterClockwise :size="22" />
        <div>
          <h2>Historial de nombres</h2>
          <p>Tu UUID se conserva cuando cambiás de nombre.</p>
        </div>
      </div>
      <p v-if="!auth.account?.nameHistory.length" class="history-empty">
        {{ loading ? 'Cargando historial…' : 'Todavía no hay cambios de nombre.' }}
      </p>
      <ul v-else class="name-history">
        <li v-for="(item, index) in auth.account.nameHistory" :key="index">
          <div>
            <span class="previous-name">{{ item.previousName }}</span
            ><PhArrowRight :size="14" /><strong>{{ item.newName }}</strong>
          </div>
          <time :datetime="item.changedAt">{{ formatDate(item.changedAt) }}</time>
        </li>
      </ul>
      <p v-if="auth.account && auth.account.historyTotal > 20" class="field-hint">
        Mostrando los últimos 20 cambios.
      </p>
    </section>
  </div>
  <AnimatedModal v-model:open="editOpen" title="Cambiar nombre de Minecraft" :busy="busy">
    <form @submit.prevent="rename">
      <NoticeMessage kind="error" v-bind="failure" /><label class="field" for="next-name"
        >Nuevo nombre<input
          id="next-name"
          v-model="nextName"
          pattern="[A-Za-z0-9_]{3,16}"
          minlength="3"
          maxlength="16"
          required /></label
      ><button class="button button-primary" :disabled="busy" type="submit">
        Guardar nombre
      </button>
    </form>
  </AnimatedModal>
</template>

<style scoped>
.launcher-credential {
  margin: 1.25rem 0;
  padding: 1rem;
  border: 1px solid var(--cl-border);
  border-radius: var(--radius-lg);
}
.launcher-credential label {
  display: block;
  margin-top: 0.75rem;
  font-size: 0.8rem;
}
.launcher-token-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px 7px 12px;
  background: var(--cl-base);
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  color: var(--cl-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.launcher-token-box:hover {
  background: var(--cl-hover);
}
.launcher-token-box .launcher-token {
  overflow-wrap: anywhere;
  white-space: normal;
  font-size: 11px;
  filter: blur(5px);
  user-select: none;
  transition: filter 0.15s ease;
}
.launcher-token-box.revealed .launcher-token {
  filter: none;
  user-select: text;
}
.launcher-token-action {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--cl-muted);
  border-left: 1px solid var(--cl-border);
  padding-left: 10px;
}
.launcher-token-box:hover .launcher-token-action {
  color: var(--cl-text);
}
.launcher-token-box.copied .launcher-token-action {
  color: var(--cl-success);
}
.security-panel > p {
  margin: 1rem 0;
}
.security-panel > .button {
  margin-top: 1rem;
}
</style>
