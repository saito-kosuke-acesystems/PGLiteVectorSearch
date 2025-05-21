<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="main-box">
    <RouterView />
  </div>
</template>

<style scoped>
.main-box {
  display: flex;
  position: relative;
  left: 0;
  right: 0;
}
</style>