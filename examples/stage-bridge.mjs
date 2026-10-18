#!/usr/bin/env node
// 多智能体后端接入舞台的最小示例（Node 18+，零依赖）。
//
// It plays the "console" role on the stage relay, the same role the test console (/director/) plays:
//   - subscribes to GET /api/stage/events?role=console (Server-Sent Events) for what the phone reports:
//     snapshot (page and cast), line-state (each line's progress), decision (how Jev staged it),
//     user-line (the customer cut in by voice), agent (each generated host's profile);
//   - posts lines to POST /api/stage/send as { from: 'console', message: { kind: 'line', ... } }.
// The phone decides how every line is performed (expressions, gestures, reactions); this side only decides who
// says what. Replace the two functions under "The brain" with your multi-agent framework; the plumbing stays.
//
// Usage: node examples/stage-bridge.mjs [--base http://localhost:3000] [--once] [--quiet]
//   --base   the server that runs the app (npm start: 3000; npm run dev: 5173)
//   --once   exit after the opening round
//   --quiet  log only what is said

const args = process.argv.slice(2)
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const BASE = (option('--base') || process.env.STAGE_BASE || 'http://localhost:3000').replace(/\/$/, '')
const ONCE = args.includes('--once'), QUIET = args.includes('--quiet')
/** How long to wait for the phone to finish a line before saying the next one anyway (it may be paused). */
const LINE_TIMEOUT_MS = Number(process.env.LINE_TIMEOUT_MS || 180_000)
const TEXT_MAX = 600, TOPIC_MAX = 40

// ── The brain: who says what. Swap these for your agents; each returns the lines to perform, in order. ──
// `cast` is the phone's line-up on stage: [{ id, name, restaurant, greeting, evidenceIds, kind, ... }].
// A line is { speaker, text, topic?, replyTo?, evidenceIds? }; speaker is a cast id or 'host' (the Orb).

function openingLines(cast) {
  return [
    { speaker: 'host', topic: '开场', text: `欢迎来到今晚的饭局！${cast.length} 位选手来争取你的一票，先请各位自我介绍。` },
    ...cast.map((member) => ({
      speaker: member.id,
      topic: '自我介绍',
      text: member.greeting || `我是${member.name}，${member.restaurant}欢迎你！`,
      // The evidence ids the phone listed for this host; the first one is the shop's own facts.
      evidenceIds: (member.evidenceIds || []).slice(0, 1),
    })),
  ]
}

function repliesToCustomer(text, cast, userLineId) {
  const [first] = cast
  return [
    { speaker: 'host', topic: '回应顾客', replyTo: [userLineId], text: `收到！你说「${text.slice(0, 40)}」，各位怎么看？` },
    ...(first ? [{ speaker: first.id, topic: '回应顾客', replyTo: [userLineId], text: `这个要求${first.restaurant}接得住，来我们家准没错！` }] : []),
  ]
}

// ── Plumbing: the relay connection, sending, and pacing on the phone's reports. ──

let snapshot = null
let opened = false
let generation = 0 // a new round (the customer cut in) stops the rounds before it
const waiters = new Map() // line id → resolve, until the phone reports it done or dropped
const names = new Map([['host', '主持人 Orb'], ['user', '顾客']])
const stopper = new AbortController()

function log(text) { if (!QUIET) console.log(text) }
function say(text) { console.log(text) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Who stands on the phone's stage now, left to right. */
function onStage() { return (snapshot?.cast || []).filter((member) => member.onStage !== false) }

/** Ids the relay accepts: 1–80 of [A-Za-z0-9_.:-]. */
function newId(prefix = 'bridge') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }

async function send(message) {
  const response = await fetch(`${BASE}/api/stage/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'console', message }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`relay ${response.status}: ${body.error || ''} ${body.detail || ''}`.trim())
  return body.id // the relay's event id
}

function finished(id) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiters.delete(id); resolve({ phase: 'timeout' }) }, LINE_TIMEOUT_MS)
    waiters.set(id, (state) => { clearTimeout(timer); waiters.delete(id); resolve(state) })
  })
}

/** Sends one line and resolves when the phone has performed it (or dropped it, or the wait ran out). */
async function speak(line) {
  const id = newId()
  const message = {
    kind: 'line', id, speaker: line.speaker, text: line.text.trim().slice(0, TEXT_MAX),
    ...(line.topic ? { topic: line.topic.slice(0, TOPIC_MAX) } : {}),
    ...(line.replyTo?.length ? { replyTo: line.replyTo.slice(0, 12) } : {}),
    ...(line.evidenceIds?.length ? { evidenceIds: line.evidenceIds.slice(0, 12) } : {}),
  }
  const done = finished(id)
  await send(message)
  say(`→ ${names.get(line.speaker) || line.speaker}：${message.text}`)
  return done
}

/** Lines in order, each after the phone finished the one before; a newer round stops this one. */
async function perform(lines) {
  const round = ++generation
  for (const line of lines) {
    if (round !== generation) return
    const result = await speak(line).catch((error) => ({ phase: 'error', note: error.message }))
    if (result.phase !== 'done') log(`  （${result.phase}${result.note ? `：${result.note}` : ''}）`)
  }
  if (round === generation && ONCE && opened) stop()
}

function maybeOpen() {
  if (opened || snapshot?.phase !== 'debate' || !onStage().length) return
  opened = true
  void perform(openingLines(onStage()))
}

function onEnvelope({ from, message }) {
  // A console receives every message, its own lines and other consoles' included; only the phone's matter here.
  if (from !== 'app') return
  switch (message.kind) {
    case 'snapshot':
      snapshot = message
      for (const member of message.cast) names.set(member.id, member.name)
      log(`← 手机在「${message.phase}」，台上 ${onStage().map((member) => member.name).join('、') || '无人'}`)
      maybeOpen()
      break
    case 'line-state':
      if (message.phase === 'queued' && message.note) log(`  … 排队中：${message.note}`)
      if (message.phase === 'done' || message.phase === 'dropped') waiters.get(message.id)?.(message)
      break
    case 'decision': {
      const speaker = message.speaker || {}
      const parts = [speaker.expr && `表情 ${speaker.expr.zh}`, speaker.gesture && `手势 ${speaker.gesture.zh}`, speaker.act && `动作 ${speaker.act.zh}`].filter(Boolean)
      log(`  ← ${message.source === 'jev' ? 'Jev' : '关键词基线'}：${parts.join(' · ') || '（无）'}`)
      break
    }
    case 'user-line':
      say(`← 顾客：${message.text}`)
      void perform(repliesToCustomer(message.text, onStage(), message.id))
      break
    case 'agent':
      names.set(message.contract.id, message.contract.name)
      break
  }
}

// Server-Sent Events by the spec's line rules: `event:` names the frame (presence), `id:` is the resume point.
async function* frames(body) {
  const decoder = new TextDecoder()
  let buffer = '', data = [], event = '', id = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).replace(/\r$/, '')
      buffer = buffer.slice(end + 1)
      if (line === '') {
        if (data.length) yield { event: event || 'message', data: data.join('\n'), id }
        data = []; event = ''; id = ''
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon), value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'data') data.push(value)
        else if (field === 'event') event = value
        else if (field === 'id') id = value
      }
    }
  }
}

// Reconnects with the last event id, so nothing the phone reported in between is missed.
async function listen() {
  let lastEventId = ''
  while (!stopper.signal.aborted) {
    try {
      const url = new URL(`${BASE}/api/stage/events`)
      url.searchParams.set('role', 'console')
      if (lastEventId) url.searchParams.set('lastEventId', lastEventId)
      const response = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: stopper.signal })
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      log(`已连上舞台中继 ${BASE}`)
      for await (const frame of frames(response.body)) {
        if (frame.id) lastEventId = frame.id
        if (frame.event === 'presence') { const presence = JSON.parse(frame.data); log(`  （在线：手机 ${presence.app} · 控制端 ${presence.console}）`); continue }
        if (frame.event === 'message') onEnvelope(JSON.parse(frame.data))
      }
    } catch (error) {
      if (stopper.signal.aborted) return
      log(`中继连接断开（${error.cause?.code || error.message}），2 秒后重连…`)
    }
    await sleep(2000)
  }
}

function stop() { stopper.abort(); for (const resolve of waiters.values()) resolve({ phase: 'stopped' }) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
log(`等待手机进入辩论页（${BASE}/）…`)
await listen()
