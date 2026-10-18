<template>
  <div class="valbar">
    <h2>Jev 与原片编排一致性</h2>
    <small>原片的 {{ FILM_LINES.length }} 句对白交给 Jev 重新决定怎么演，再和手工编排逐项比对</small>
    <span class="sp"></span>
    <button v-if="done" class="btn ghost" type="button" @click="exportResult"><Icon name="download" />导出</button>
    <button class="btn primary" type="button" :disabled="running" @click="run"><Icon name="play" />{{ running ? '运行中…' : '运行' }}</button>
  </div>
  <div class="kpis">
    <div v-for="[key, zh] in KINDS" :key="key" class="kpi">
      <small>{{ zh }}</small>
      <b>{{ score[key][2] ? `${Math.round((score[key][0] / score[key][2]) * 100)}%` : '—' }}</b>
      <span>Top-1 {{ score[key][0] }}/{{ score[key][2] }} · Top-3 {{ score[key][1] }}/{{ score[key][2] }}</span>
    </div>
  </div>
  <div v-if="rows.length" class="tablewrap">
    <table class="vt">
      <thead><tr><th></th><th>台词</th><th>开口表情</th><th>手势</th><th>身体动作</th><th>旁听反应</th><th></th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.line.id">
          <td><Face :who="faceOf(row.line.who)" :size="26" /></td>
          <td>
            <div>{{ row.line.text }}</div>
            <div v-if="quoteOf(row)" class="sub2">↩ {{ quoteOf(row) }}</div>
            <div class="sub2 mono">{{ row.line.id }}</div>
          </td>
          <td v-if="row.error" colspan="5" class="miss">{{ row.error }}</td>
          <template v-else>
            <td><Judgement :judged="row.expr" :face="row.line.who === 'orb' ? '' : faceOf(row.line.who)" :names="EXPR" /></td>
            <td><Judgement :judged="row.gesture" :names="GESTURE" /></td>
            <td><Judgement :judged="row.act" :names="ACT" /></td>
            <td>
              <div v-for="listener in row.listeners" :key="listener.who" class="cell" :class="listener.hit1 ? 'hit' : listener.hit3 ? 'near' : 'miss'" :title="`原片 ${EXPR[listener.truth] ?? listener.truth}`">
                <Face :who="faceOf(listener.who)" :expr="listener.choice" :size="22" />{{ EXPR[listener.choice] ?? listener.choice }}
              </div>
              <span v-if="!row.listeners.length" class="sub2">—</span>
            </td>
            <td><span class="srcbadge" :class="row.source === 'jev' ? 'jev' : 'baseline'" :title="row.note">{{ row.source === 'jev' ? 'Jev' : '基线' }}</span></td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { defineComponent, h, ref, type PropType } from 'vue'
import { ACTS, EXPRESSIONS, GESTURES } from '@/agents/catalog/performance'
import { download } from '../assets/export.ts'
import { FILM_CHARACTERS, FILM_HOST, FILM_LINES } from '../data/film.ts'
import Face from '../ui/Face.vue'
import Icon from '../ui/Icon.vue'
import { toast } from '../ui/toast.ts'
import { emptyScore, runCheck, type CheckRow, type Judged, type Score, type ScoreKey } from './check.ts'

// How close Jev comes to the film's hand-made choreography, line by line (agent-studio's 一致性检查).
const KINDS: [ScoreKey, string][] = [['expr', '开口表情'], ['gesture', '手势'], ['act', '身体动作'], ['listener', '旁听反应']]
const names = (list: readonly { id: string; zh: string }[]) => Object.fromEntries(list.map((item) => [item.id, item.zh])) as Record<string, string>
const EXPR = names(EXPRESSIONS), GESTURE = names(GESTURES), ACT = names(ACTS)
const rows = ref<CheckRow[]>([]), score = ref<Score>(emptyScore()), running = ref(false), done = ref(false)

const faceOf = (who: string) => (who === FILM_HOST.id ? 'host' : `film:${who}`)
const nameOf = (who: string) => FILM_CHARACTERS.find((film) => film.id === who)?.name ?? FILM_HOST.name
function quoteOf(row: CheckRow) {
  const quoted = row.line.truth.quote ? FILM_LINES.find((line) => line.id === row.line.truth.quote) : undefined
  return quoted ? `${nameOf(quoted.who)}：${quoted.text.slice(0, 16)}` : ''
}

async function run() {
  running.value = true
  done.value = false
  rows.value = []
  score.value = emptyScore()
  try {
    await runCheck((row, next) => { rows.value = [...rows.value, row]; score.value = { ...next } })
    done.value = true
  } catch (error) { toast(error instanceof Error ? error.message : String(error), 'bad') }
  running.value = false
}

function exportResult() {
  download('jev-vs-film.json', JSON.stringify({ score: score.value, rows: rows.value.map((row) => ({ id: row.line.id, source: row.source, answers: row.answers, truth: row.line.truth, error: row.error })) }, null, 1))
}

// One judged choice: what Jev chose (hit, in the top three, or a miss) and the film's choice with Jev's probability for it.
const Judgement = defineComponent({
  props: { judged: Object as PropType<Judged | undefined>, face: { type: String, default: '' }, names: { type: Object as PropType<Record<string, string>>, required: true } },
  setup(props) {
    return () => {
      const j = props.judged
      if (!j) return h('span', { class: 'sub2' }, '—')
      return [
        h('div', { class: ['cell', j.hit1 ? 'hit' : j.hit3 ? 'near' : 'miss'] }, [props.face ? h(Face, { who: props.face, expr: j.choice, size: 22 }) : null, props.names[j.choice] ?? j.choice]),
        h('div', { class: 'sub2' }, `原片 ${props.names[j.truth] ?? j.truth} · ${Math.round(j.p * 100)}%`),
      ]
    }
  },
})
</script>
