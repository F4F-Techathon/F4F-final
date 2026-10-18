import { watch } from 'vue'
import type { CastAct } from '@/agents/feed/protocol'
import type { ShopInfo } from '@/agents/generation/shop'
import { useDirector } from '../core/director.ts'
import { generate } from '../core/generation.ts'
import { removeAgent } from '../core/library.ts'
import { brandAgent, guestProfile, useRegistry, type Character } from '../core/registry.ts'
import { autosave, deleteSession, lastAutosave, listSessions, parseSessionFile, saveSession, sessionFrom, threadFrom, type Session } from '../core/sessions.ts'
import { isLine, isStage, type LineItem, type StageItem } from '../core/timeline.ts'
import { askName, confirmBox } from '../ui/dialogs.ts'
import { download } from '../assets/export.ts'
import { toast } from '../ui/toast.ts'
import { live, useLive } from './state.ts'

const failed = (error: unknown) => toast(error instanceof Error ? error.message : String(error), 'bad', 3200)

/* ------------------------------------------------------------------ stage directions */
const recent = new Map<string, number>()

// agent-studio's checks before a stage act: nothing that would not change anything, six on stage at most,
// and a second click within 450 ms is the same click.
export async function stageAct(act: CastAct, id: string) {
  const director = useDirector(), { character, room } = useLive()
  const now = Date.now()
  if (now - (recent.get(`${act}:${id}`) ?? 0) < 450) return
  recent.set(`${act}:${id}`, now)
  const entry = director.cast.value.find((item) => item.id === id)
  const name = character(id).name
  if (act === 'exit' && entry?.onStage === false) { toast(`${name}已经下场了`); return }
  if (act === 'enter' && entry && entry.onStage !== false) { toast(`${name}已经在台上`); return }
  if (act === 'enter' && room.value <= 0) { toast('舞台已满（最多 6 位），先让一位下场'); return }
  const guest = act === 'enter' && entry?.kind !== 'host' ? guestProfile(character(id)) ?? undefined : undefined
  try { await director.stageAct(act, id, guest) } catch (error) { failed(error) }
}

// A library agent (or a brand's mascot, generated first if no agent plays it yet) walks on as a guest.
export async function invite(character: Character) {
  const director = useDirector(), registry = useRegistry(), { room } = useLive()
  // A phone that opens later starts from then on, so a guest sent now would never arrive.
  if (!director.peers.value?.app) { toast('手机还没打开：在手机上打开页面后再请嘉宾上台'); return }
  if (room.value <= 0) { toast('舞台已满（最多 6 位），先让一位下场'); return }
  let target = character
  if (character.kind === 'mascot' && character.brand) {
    const existing = brandAgent(character.brand.id)
    if (existing) target = registry.get(existing.id) ?? character
    else {
      toast(`${character.brand.name}还没有 agent，先生成一个`)
      try {
        const agent = await generate(emptyShop(character.brand.name))
        target = registry.get(agent.id) ?? character
      } catch (error) { failed(error); return }
    }
  }
  const guest = guestProfile(target)
  if (!guest) { toast('这个角色没有可以登台的资料'); return }
  if (director.cast.value.some((entry) => entry.id === target.id && entry.onStage !== false)) { toast(`${target.name}已经在台上`); return }
  try {
    await director.stageAct('enter', target.id, guest)
    toast(`${target.name} 登场`)
  } catch (error) { failed(error) }
}

export const emptyShop = (name: string): ShopInfo => ({ name, cuisine: '', price: null, distance: null, dishes: '', selling: '', owner: '', address: '', desc: '' })

// A new agent made with 「+」: into the library, onto the stage (room permitting), and it says hello.
export async function generateAndGreet(shop: ShopInfo) {
  const director = useDirector(), registry = useRegistry(), { room } = useLive()
  let agent
  try { agent = await generate(shop) } catch (error) { failed(error); return }
  const character = registry.get(agent.id)
  if (!character) return
  if (room.value <= 0) { toast(`${agent.name} 已收进资产库；舞台已满，先让一位下场再请上台`); return }
  try {
    await director.stageAct('enter', agent.id, guestProfile(character) ?? undefined)
    if (agent.greeting) await director.sendLine({ speaker: agent.id, text: agent.greeting, topic: '开场白', replyTo: [], evidenceIds: [], interrupt: false })
  } catch (error) { failed(error) }
}

export async function removeGuest(id: string) {
  const director = useDirector()
  try { await director.stageAct('remove', id) } catch (error) { failed(error) }
}

export async function deleteAgent(character: Character) {
  const director = useDirector()
  const { ok } = await confirmBox({ title: `删除 ${character.name}？`, body: '从资产库删除这个 agent；在台上的话也会撤下。删除后不能恢复，需要的话先导出 JSON。', ok: '删除', danger: true })
  if (!ok) return
  if (director.cast.value.some((entry) => entry.id === character.id)) await director.stageAct('remove', character.id).catch(() => undefined)
  removeAgent(character.id)
  toast(`已删除 ${character.name}`)
}

/** Every host on stage says its greeting, in line-up order. */
export async function sendGreetings() {
  const director = useDirector()
  const greeters = director.onStage.value.filter((entry) => entry.greeting)
  if (!greeters.length) { toast('还没有生成好开场白的选手'); return }
  try {
    for (const entry of greeters) await director.sendLine({ speaker: entry.id, text: entry.greeting!, topic: '开场白', replyTo: [], evidenceIds: [], interrupt: false })
    toast(`已发出 ${greeters.length} 句开场白`)
  } catch (error) { failed(error) }
}

/* ------------------------------------------------------------------ lines */
export async function sendDraft(text: string) {
  const director = useDirector(), { speaker } = useLive()
  if (!text.trim()) return false
  try {
    await director.sendLine({ speaker: speaker.value, text, replyTo: live.quotes, evidenceIds: live.evidence, topic: live.topic, interrupt: live.interrupt })
    live.quotes = []
    live.evidence = []
    return true
  } catch (error) { failed(error); return false }
}

export async function replay(card: LineItem) {
  try { await useDirector().resend(card) } catch (error) { failed(error) }
}

export async function commitEdit(card: LineItem, text: string) {
  const director = useDirector()
  if (!text.trim()) return
  if (card.phase === 'deciding' || card.phase === 'speaking') { toast('这句还在演，演完再改'); return }
  live.editing = null
  if (text.trim() === card.text) return
  try { await director.resend(card, { text }) } catch (error) { failed(error) }
}

export async function removeCard(item: LineItem | StageItem) {
  if (live.inspecting === item.id) live.inspecting = null
  live.quotes = live.quotes.filter((id) => id !== item.id)
  await useDirector().remove(item)
}

// The inspector's hand-set slots: kept on the card and carried by every replay; one is performed at once when the stage is free.
export async function setOverride(card: LineItem, slot: string, value: string | null) {
  const director = useDirector()
  const override = { ...(card.override ?? {}) }
  if (value) override[slot] = value
  else delete override[slot]
  card.override = Object.keys(override).length ? override : undefined
  if (director.busy.value) { toast('台上正忙，演完后点 ⟲ 按新设定重播'); return }
  try { await director.resend(card, { override }) } catch (error) { failed(error) }
}

/* ------------------------------------------------------------------ play-all */
let looping: ReturnType<typeof setTimeout> | undefined
let sent = false // every item of the current play-all has gone out

// Everything in the thread again, from the line-up it began with: the phone clears its queue, resets the
// line-up, brings the opening guests back, then performs each line and stage direction in order.
export async function playAll() {
  const director = useDirector(), registry = useRegistry()
  const items = director.state.timeline.filter((item): item is LineItem | StageItem => (isLine(item) && item.seen) || isStage(item))
  if (!items.length) { toast('会话里还没有台词'); return }
  clearTimeout(looping)
  live.playing = true
  try {
    await director.clearStage(true)
    await director.quietCast('reset')
    for (const id of director.state.lineup0 ?? []) {
      const character = registry.get(id)
      const guest = character && guestProfile(character)
      if (guest) await director.quietCast('enter', id, guest)
    }
    for (const item of items) {
      if (!live.playing) return
      if (item.type === 'line') await director.resend(item)
      else {
        const character = registry.get(item.who)
        await director.replayStage(item, item.act === 'enter' && character ? guestProfile(character) ?? undefined : undefined)
      }
    }
    sent = true
  } catch (error) { live.playing = false; failed(error) }
}

export async function stopAll() {
  clearTimeout(looping)
  live.playing = false
  sent = false
  await useDirector().clearStage(true).catch(failed)
}

// Play-all ends when the phone has finished everything it was sent; with 循环 on it starts again 1.2 s later.
export function watchPlayAll() {
  const director = useDirector()
  watch(() => director.busy.value, (busy) => {
    if (busy || !live.playing || !sent) return
    sent = false
    if (live.loop) looping = setTimeout(() => { if (live.playing) void playAll() }, 1200)
    else live.playing = false
  })
}

/* ------------------------------------------------------------------ sessions */
export async function saveCurrent() {
  const director = useDirector()
  const name = live.session.name || await askName({ title: '保存会话', value: defaultName(), placeholder: '会话名称', ok: '保存' })
  if (!name) return
  const session = sessionFrom(director.state, name, live.session.id ?? undefined)
  if (!saveSession(session)) { toast('浏览器存储满了，先导出 JSON 或删掉旧会话', 'bad', 3200); return }
  live.session = { id: session.id, name }
  toast(`已保存「${name}」· ${session.items.filter((item) => item.kind === 'line').length} 句`)
}

function defaultName() {
  const now = new Date()
  return `路演 ${now.getMonth() + 1}-${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export async function loadSession(session: Session, play = false) {
  const director = useDirector()
  await stopAll()
  const { timeline, counter } = threadFrom(session, director.state.counter)
  director.state.timeline = timeline
  director.state.counter = counter
  director.state.aliases = {}
  director.state.lineup0 = session.lineup
  live.session = { id: session.id === '_autosave' ? null : session.id, name: session.id === '_autosave' ? '' : session.name }
  live.inspecting = null
  live.quotes = []
  director.save()
  const lines = session.items.filter((item) => item.kind === 'line').length
  toast(`已载入 · ${lines} 句`)
  if (play) await playAll()
}

export async function clearSession() {
  const director = useDirector()
  const { ok } = await confirmBox({ title: '清空会话？', body: '清空导演台的对话流，并清空手机上排队的台词。手机上已经演过的历史不受影响。', ok: '清空', danger: true })
  if (!ok) return
  await stopAll()
  director.clearThread()
  live.session = { id: null, name: '' }
  live.inspecting = null
  live.quotes = []
}

export function exportCurrent() {
  const director = useDirector()
  const session = sessionFrom(director.state, live.session.name || defaultName(), live.session.id ?? undefined)
  download(`${session.name.replace(/[\\/:*?"<>|\s]+/g, '-')}.session.json`, JSON.stringify(session, null, 1))
}

export async function importSessionFile(file: File) {
  try {
    const session = parseSessionFile(await file.text())
    saveSession(session)
    toast(`已导入「${session.name}」`)
    return session
  } catch (error) { failed(error); return null }
}

export { deleteSession, lastAutosave, listSessions }

// The thread saves itself 1.2 s after it changes, so a closed tab can come back with 「恢复上次会话」.
export function watchAutosave() {
  const director = useDirector()
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(() => [director.state.timeline.length, director.lines.value.filter((line) => line.phase === 'done').length], () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (director.state.timeline.some((item) => item.type !== 'clear')) autosave(sessionFrom(director.state, live.session.name || '自动保存', '_autosave'))
    }, 1200)
  })
}
