<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { PhArrowLeft } from '@phosphor-icons/vue'
</script>
<template>
  <div class="container empty-page">
    <span class="eyebrow">404 · PÁGINA NO ENCONTRADA</span>
    <h1>No encontramos esta página.</h1>
    <p class="muted">La página que buscás no existe o cambió de dirección.</p>
    <RouterLink to="/" class="button button-primary"
      ><PhArrowLeft :size="16" /> Volver a mi cuenta</RouterLink
    >
  </div>
</template>
