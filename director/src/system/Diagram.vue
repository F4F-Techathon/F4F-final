<template>
  <div ref="root" class="diag" v-html="svg"></div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useDirector } from '../core/director.ts'
import { onEvent, type StudioEvent } from '../core/events.ts'
import { useRegistry } from '../core/registry.ts'
import { service, voiceOf } from '../core/status.ts'
import { IN_DEV } from '../core/where.ts'

// This project's architecture, rebuilt whenever the line-up changes and lit live from the event bus: the console
// and the multi-agent backend (its lines reach the relay as the phone's mirror) → the stage relay → the phone (queue → Jev → choreography → each performer),
// and the two generation pipelines, the phone's hosts and agents made here.
const director = useDirector(), registry = useRegistry()
const root = ref<HTMLElement>()
const NW = 184, NH = 58

interface Node { id: string; x: number; y: number; t: string; s: string; c?: string; w?: number; cls?: string }

const LIGHT: Record<string, string[]> = {
  'relay.state': ['relay'], 'phone.presence': ['stage'], 'phone.phase': ['stage'],
  'line.send': ['director', 'relay'], 'line.resend': ['director', 'relay'], 'user.line': ['pf:user', 'relay'],
  'line.queued': ['queue'], 'line.deciding': ['jev'], 'jev.answer': ['jev', 'perf'], 'line.speaking': ['perf', 'stage'], 'line.done': ['stage'], 'line.dropped': ['queue'],
  'cast.send': ['director', 'relay'], 'cast.queued': ['queue'], 'cast.speaking': ['stage'], 'cast.done': ['stage'], 'stage.clear': ['queue', 'stage'],
  'host.ready': ['p_kit'], 'agent.ready': ['p_kit'], 'gen.start': ['g_shop'], 'gen.done': ['g_lib'],
}
const HOST_STEP: Record<string, string> = { 形象: 'p_look', 口音: 'p_accent', 组件: 'p_assets' }

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
// Clips to n CJK-character widths (Latin letters count a little over half).
function clip(text: string, n: number) {
  let width = 0
  for (let i = 0; i < text.length; i += 1) {
    width += text.charCodeAt(i) > 0x2e80 ? 1 : 0.56
    if (width > n) return text.slice(0, i) + '…'
  }
  return text
}

const svg = computed(() => {
  const performers = [
    { id: 'host', t: 'Orb · 主持人', s: '需求 · 洞察 · 预订', c: '#C9B3F2' },
    ...director.onStage.value.map((entry) => {
      const character = registry.get(entry.id)
      return { id: entry.id, t: `${entry.name} · ${entry.restaurant}`, s: entry.kind === 'guest' ? `嘉宾 · ${character?.source === 'created' ? '导演台新建' : '资产库'}` : entry.status === 'ready' ? '本场店主' : '化妆中', c: character?.color ?? entry.color }
    }),
    { id: 'user', t: '我 · 台下顾客', s: '长按插话', c: '#D9B77F' },
  ]
  const nodes: Node[] = []
  const n = (id: string, x: number, y: number, t: string, s: string, extra: Partial<Node> = {}) => nodes.push({ id, x, y, t, s, ...extra })
  const top = 34, colH = Math.max(performers.length * 66, 3 * 80), mid = top + colH / 2 - NH / 2
  n('director', 18, mid - 40, IN_DEV ? '导演台 · 5174' : '导演台', '台词 · 走台 · 检视')
  const agents = service.status?.agents, voice = voiceOf(service.status)
  n('backend', 18, mid + 40, '多智能体后端', agents?.reachable ? [agents.model, voice.name].filter(Boolean).join(' · ') || '在线' : '未连接 · 导演台驱动', agents?.reachable ? {} : { cls: 'future' })
  n('relay', 230, mid, '舞台中继', '/api/stage · SSE · 重放')
  n('queue', 446, top + colH * 0.18 - NH / 2 + 10, '台词队列', '排队 · 插话插队 · 走台')
  n('jev', 446, mid, 'Jev 决策', '/api/jev → TypeSafe')
  n('perf', 446, top + colH * 0.82 - NH / 2 - 10, '表演编排', 'prepare · intent · perform')
  performers.forEach((p, index) => n(`pf:${p.id}`, 690, top + (colH - performers.length * 66) / 2 + index * 66, p.t, p.s, { c: p.c }))
  n('stage', 925, mid, IN_DEV ? '手机舞台 · 5173' : '手机舞台', `${director.onStage.value.length} 位在台 · 字幕 · 聚光`)
  const gy = top + colH + 64, gy2 = gy + NH + 52
  const lane = (prefix: string, y: number, items: [string, string, string][]) => items.forEach(([id, t, s], index) => n(`${prefix}_${id}`, 18 + index * 186, y, t, s, { cls: 'gen', w: 170 }))
  lane('p', gy, [['shop', '店铺信息', '真实数据 · logo 主色'], ['look', 'Jev · 形象', '体型 发型 服装 · 品牌吉祥物'], ['accent', 'Jev · 口音', '菜系 → 地区口音'], ['assets', 'Jev · 组件', '招牌表情 手势 动作 反应'], ['kit', 'rigkit · 上台', '模板 × 部件 × 胸牌']])
  lane('g', gy2, [['shop', '店铺信息 + logo', '「+ 添加」输入'], ['look', 'Jev · 形象', '同一个生成器'], ['accent', 'Jev · 口音', '菜系 → 地区口音'], ['assets', 'Jev · 组件', '招牌表情 手势 动作'], ['lib', '资产库 · 嘉宾', '登台：cast enter']])
  const by = Object.fromEntries(nodes.map((node) => [node.id, node]))
  const edges: [string, string, string?][] = [
    ['director', 'relay'], ['backend', 'relay', 'gen'], ['relay', 'queue'], ['queue', 'jev'], ['jev', 'perf'],
    ...performers.map((p): [string, string] => ['perf', `pf:${p.id}`]), ...performers.map((p): [string, string] => [`pf:${p.id}`, 'stage']),
    ['p_shop', 'p_look', 'gen'], ['p_look', 'p_accent', 'gen'], ['p_accent', 'p_assets', 'gen'], ['p_assets', 'p_kit', 'gen'],
    ['g_shop', 'g_look', 'gen'], ['g_look', 'g_accent', 'gen'], ['g_accent', 'g_assets', 'gen'], ['g_assets', 'g_lib', 'gen'],
  ]
  const H = gy2 + NH + 26
  const width = (node: Node) => node.w ?? NW
  let s = `<svg viewBox="0 0 1130 ${H}" class="diagsvg" role="img" aria-label="系统架构"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#4a4d5e"/></marker></defs>`
  s += `<rect class="phonebox" x="432" y="${top - 18}" width="${1130 - 432 - 8}" height="${colH + 28}" rx="18"/><text class="lane" x="440" y="${top - 24}">手机 · 辩论页（DebateView）</text>`
  s += `<text class="lane" x="18" y="${gy - 14}">手机端生成 · 店铺 → 本场店主</text><text class="lane" x="18" y="${gy2 - 14}">导演台新建 · 店铺 → 嘉宾</text>`
  for (const [a, b, cls] of edges) {
    const A = by[a], B = by[b]
    if (!A || !B) continue
    const x1 = A.x + width(A), y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2, mx = (x1 + x2) / 2
    s += `<path class="edge${cls ? ` ${cls}` : ''}" data-e="${a}-${b}" d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" marker-end="url(#ar)"/>`
  }
  // The phone's generator feeds the performers; agents made here walk on through the relay.
  const kit = by.p_kit!, last = by[`pf:${performers[performers.length - 2]?.id ?? 'host'}`]!, lib = by.g_lib!, relay = by.relay!
  s += `<path class="edge gen" data-e="p_kit-performers" d="M ${kit.x + width(kit)} ${kit.y + NH / 2} C ${kit.x + width(kit) + 60} ${kit.y + NH / 2}, ${last.x + NW / 2} ${kit.y - 20}, ${last.x + NW / 2} ${last.y + NH}" marker-end="url(#ar)"/>`
  s += `<path class="edge gen" data-e="g_lib-relay" d="M ${lib.x + width(lib)} ${lib.y + NH / 2} C ${lib.x + width(lib) + 80} ${lib.y + NH / 2}, ${relay.x + NW / 2} ${lib.y - 40}, ${relay.x + NW / 2} ${relay.y + NH}" marker-end="url(#ar)"/>`
  for (const node of nodes) {
    s += `<g class="node${node.cls ? ` ${node.cls}` : ''}" data-n="${esc(node.id)}"><rect class="box" x="${node.x}" y="${node.y}" width="${width(node)}" height="${NH}" rx="14"/>`
    if (node.c) s += `<circle cx="${node.x + 18}" cy="${node.y + 21}" r="5" fill="${node.c}"/>`
    s += `<text class="nt" x="${node.x + (node.c ? 30 : 15)}" y="${node.y + 26}">${esc(clip(node.t, node.c ? 11 : 12))}</text><text class="ns" x="${node.x + 15}" y="${node.y + 45}">${esc(clip(node.s, 15))}</text></g>`
  }
  return s + '</svg>'
})

// An event lights its nodes (and the edges into them) for 1.2 s.
const timers = new Map<Element, ReturnType<typeof setTimeout>>()
function flash(element: Element, cls: string) {
  element.classList.add(cls)
  clearTimeout(timers.get(element))
  timers.set(element, setTimeout(() => element.classList.remove(cls), 1200))
}
function light(event: StudioEvent) {
  const ids = [...(LIGHT[event.type] ?? [])]
  if (event.type === 'host.gen' && event.detail && HOST_STEP[event.detail]) ids.push(HOST_STEP[event.detail]!)
  if (event.type === 'gen.step' && event.detail) ids.push(`g_${event.detail.split(':')[0]}`)
  if (event.who && !event.type.startsWith('gen.') && !event.type.startsWith('host.')) ids.push(`pf:${event.who}`)
  for (const id of ids) {
    const node = root.value?.querySelector(`[data-n="${CSS.escape(id)}"]`)
    if (node) flash(node, 'hot')
    root.value?.querySelectorAll(`[data-e$="-${CSS.escape(id)}"]`).forEach((edge) => flash(edge, 'flow'))
  }
}
const off = onEvent(light)
onBeforeUnmount(() => { off(); timers.forEach((timer) => clearTimeout(timer)) })
</script>
