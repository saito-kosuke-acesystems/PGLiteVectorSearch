/// <reference types="vite/client" />

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import BotBox from '@/views/BotBox.vue'

const routes = [
  { path: '/', name: 'Top', component: BotBox }
]

const router = createRouter({
    history: createWebHistory('/'),
    routes
})

export default router