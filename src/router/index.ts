import { createRouter, createWebHistory } from 'vue-router'
import { useDiningStore } from '@/stores/dining'
import { APP_NAME } from '@/data/app'
const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes: [
  { path: '/', component: () => import('@/views/HomeView.vue'), meta: { title: APP_NAME } },
  { path: '/input', component: () => import('@/views/InputView.vue'), meta: { title: '说说你的想法' } },
  { path: '/pick', component: () => import('@/views/PickView.vue'), meta: { title: '挑个心动的', needsInput: true } },
  { path: '/filter', redirect: '/pick' },
  { path: '/map', redirect: '/pick' },
  { path: '/debate', component: () => import('@/views/DebateView.vue'), meta: { title: APP_NAME, needsInput: true, needsSelection: true } },
  { path: '/result', component: () => import('@/views/ResultView.vue'), meta: { title: '今晚的选择', needsInput: true, needsSelection: true, needsDecision: true } },
  { path: '/restaurant/:id', component: () => import('@/views/RestaurantView.vue'), meta: { title: '餐厅详情' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
], scrollBehavior: (_to, _from, saved) => saved || { top: 0 } })
// Keeps protected pages tied to a valid cast and applies the product title.
router.beforeEach((to) => {
  const store = useDiningStore()
  if (to.meta.needsInput && !store.rawInput) return '/input'
  if (to.meta.needsSelection && !store.canStartDebate) return '/pick'
  if (to.meta.needsDecision && !store.winner) return '/debate'
  document.title = to.meta.title === APP_NAME ? APP_NAME : `${to.meta.title} · ${APP_NAME}`
})
export default router
