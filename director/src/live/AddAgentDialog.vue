<template>
  <div v-if="live.adding" class="scrim" @pointerdown.self="close">
    <div class="modal gen-modal" role="dialog" aria-modal="true" aria-label="新建店铺 agent" @keydown="keys">
      <div class="modal-h"><h2>新建店铺 agent</h2><span class="sp"></span><button class="iconbtn sm" type="button" title="关闭" @click="close"><Icon name="close" /></button></div>
      <div class="modal-b">
        <div class="gen-flow"><span><em>1</em>形象</span><span><em>2</em>口音</span><span><em>3</em>组件</span><span class="dim">声音 · 暂未接入</span></div>
        <p>第一行写店名，其余随意写（也可以写「菜系：湘菜」这样的键值）。logo 可选：主色定主题色，logo 印在胸牌上。生成在导演台里直接问 Jev，生成好收进资产库，并请上台说开场白。</p>
        <textarea ref="area" v-model="text" class="gen-text" :placeholder="PLACEHOLDER" maxlength="2000" />
        <button class="logo-drop" :class="{ over }" type="button" @click="file?.click()" @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="drop">
          <span class="logo-prev"><img v-if="logo" :src="logo.data" alt="logo" /><Icon v-else name="image" /></span>
          <span class="logo-meta">
            <b>{{ logo ? 'logo 已就绪' : '店铺 logo（可选）' }}</b>
            <small>{{ logo ? (logo.colors.length ? '主色' : '没有明显主色 · 由 Jev 选主题色') : '点击或拖入图片 · 只在浏览器里取主色，不上传' }}</small>
            <span v-if="logo?.colors.length" class="logo-sw"><span v-for="color in logo.colors" :key="color.hex" class="sw"><i :style="{ background: color.hex }"></i>{{ color.hex }} · {{ Math.round(color.share * 100) }}%</span></span>
          </span>
        </button>
        <input ref="file" type="file" accept="image/*" hidden @change="pick" />
        <div class="presets"><span class="dim">示例</span><button v-for="preset in PRESETS" :key="preset.name" type="button" @click="usePreset(preset)">{{ preset.name }}</button></div>
      </div>
      <div class="modal-f">
        <span class="dim mono">⌘/Ctrl + 回车</span><span class="sp"></span>
        <button class="btn ghost" type="button" @click="close">取消</button>
        <button class="btn primary" type="button" :disabled="!text.trim()" @click="go"><Icon name="spark" />生成 agent</button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ShopColor } from '@/agents/generation/shop'
import { processLogo } from '@/agents/generation/logo'
import { parseShop } from '../core/shop.ts'
import Icon from '../ui/Icon.vue'
import { toast } from '../ui/toast.ts'
import { generateAndGreet } from './actions.ts'
import { live } from './state.ts'

// agent-studio's 「+」: shop info and an optional logo in; the generator (形象 → 口音 → 组件) runs here.
const PLACEHOLDER = '第一行写店名，其余随意写，例如：\n湘里人家\n菜系：湘菜\n人均：68元\n距离：1.5km\n招牌：剁椒鱼头、辣椒炒肉\n店主：陈姐\n简介：开了二十年的家常湘菜馆'
interface Preset { name: string; text: string; logo: { bg: string; fg: string; ch: string; ring: string } }
// Demo shops, each with a logo drawn on a canvas so the logo path is exercised too (agent-studio agentgen.js).
const PRESETS: Preset[] = [
  { name: '湘里人家', text: '湘里人家\n菜系：湘菜\n人均：68元\n距离：1.5km\n招牌：剁椒鱼头、辣椒炒肉\n店主：陈姐\n简介：开了二十年的家常湘菜馆，辣得过瘾，米饭免费续。', logo: { bg: '#B8322A', fg: '#FFF4E2', ch: '湘', ring: '#F2C14E' } },
  { name: '鮨·一期一会', text: '鮨·一期一会\n菜系：日料 / 寿司 Omakase\n人均：398元\n距离：800米\n卖点：主厨每天从筑地直送的鱼，12 贯握寿司，只有 8 个吧台位', logo: { bg: '#1F2A44', fg: '#F4EFE6', ch: '鮨', ring: '#C9A44C' } },
  { name: "Luigi's Pizzeria", text: "Luigi's Pizzeria\n意式手工披萨，柴火窑烤，人均 120，距离 2.3 公里。\n招牌：玛格丽特披萨、提拉米苏\n老板是那不勒斯人，嗓门很大，爱讲他奶奶的配方。", logo: { bg: '#2E7D4F', fg: '#FFFFFF', ch: 'L', ring: '#D64541' } },
  { name: '老北京炸酱面', text: '老北京炸酱面馆\n百年老字号，人均35，距离 600米。\n招牌：炸酱面、卤煮、豆汁儿\n老爷子亲自掌勺，说话慢悠悠的。', logo: { bg: '#C98A2B', fg: '#3B2412', ch: '京', ring: '#3B2412' } },
]

const text = ref(''), over = ref(false)
const logo = ref<{ data: string; colors: ShopColor[] } | null>(null)
const area = ref<HTMLTextAreaElement>(), file = ref<HTMLInputElement>()
watch(() => live.adding, async (open) => { if (open) { await nextTick(); area.value?.focus() } })

function drawLogo(spec: Preset['logo']) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 96
  const g = canvas.getContext('2d')!
  g.fillStyle = spec.bg
  g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.fill()
  g.strokeStyle = spec.ring
  g.lineWidth = 5
  g.beginPath(); g.arc(48, 48, 39, 0, Math.PI * 2); g.stroke()
  g.fillStyle = spec.fg
  g.font = `600 ${/[A-Za-z]/.test(spec.ch) ? 50 : 44}px "Noto Serif SC", serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(spec.ch, 48, 51)
  return canvas
}

async function useLogo(source: Blob | HTMLCanvasElement) {
  try { logo.value = await processLogo(source) } catch (error) { toast(error instanceof Error ? error.message : '图片读不出来', 'bad') }
}
async function usePreset(preset: Preset) {
  text.value = preset.text
  await useLogo(drawLogo(preset.logo))
}
function pick(event: Event) {
  const picked = (event.target as HTMLInputElement).files?.[0]
  if (picked) void useLogo(picked)
  ;(event.target as HTMLInputElement).value = ''
}
function drop(event: DragEvent) {
  over.value = false
  const dropped = event.dataTransfer?.files?.[0]
  if (dropped?.type.startsWith('image/')) void useLogo(dropped)
}

function close() {
  live.adding = false
}
function reset() {
  text.value = ''
  logo.value = null
}

function go() {
  const shop = parseShop(text.value)
  if (!shop.name) { toast('第一行写店名'); return }
  close()
  const input = { ...shop, logo: logo.value?.data ?? null, colors: logo.value?.colors ?? [] }
  reset()
  void generateAndGreet(input)
}

function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); close() }
  else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); go() }
}
</script>
