/// <reference types="vite/client" />

import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import BotBox from '@/views/BotBox.vue'

const routes = [
  { path: '/', name: 'Top', component: BotBox }
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

export default router