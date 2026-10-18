import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { PERFORMANCE_CATALOG } from '@/agents/catalog/performance'
import { askJev } from '@/agents/jev/client'
import { provideGenerationDeps } from '@/stores/cast'
import '@/assets/styles/base.less'

// The agent layer's collaborators: hosts are described in the performance catalog and decided by Jev
// (through the same-origin /api/jev relay), with keyword rules whenever Jev is unavailable.
provideGenerationDeps({ catalog: PERFORMANCE_CATALOG, ask: askJev })

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
