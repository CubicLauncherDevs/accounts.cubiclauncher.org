<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AccountView from './AccountView.vue'
</script>

<template>
  <div class="container account-page">
    <div class="preview-banner" role="status">
      <span>Vista de demostración · Datos ficticios · Acciones deshabilitadas</span>
      <RouterLink to="/login" class="text-link">Ir al login</RouterLink>
    </div>
    <div class="page-heading">
      <div>
        <span class="eyebrow">TU CUENTA CUBIC</span>
        <h1>Hola, CubicPlayer<span class="heading-dot">.</span></h1>
        <p class="muted">Tu perfil, tu apariencia y el próximo mundo por explorar.</p>
      </div>
      <span class="account-badge">Demostración</span>
    </div>
    <AccountView preview />
  </div>
</template>
