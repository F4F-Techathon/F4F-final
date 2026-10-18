<template>
  <BottomSheet :open="!!sheet" :title="sheetTitles[sheet] || ''"
    :size="sheet === 'history' || sheet === 'conditions' ? 'large' : 'medium'" @close="closeSheet">
    <div class="debate-sheet">
      <template v-if="sheet === 'history'">
        <div class="chips history-filters">
          <button class="chip" :class="{ active: !historyRole }" @click="historyRole = ''">全部</button>
          <button v-for="restaurant in store.selected" :key="restaurant.id" class="chip"
            :class="{ active: historyRole === restaurant.id }" @click="historyRole = restaurant.id">{{ cast.hostNameOf(restaurant) }}</button>
          <button class="chip" :class="{ active: historyRole === 'user' }" @click="historyRole = 'user'">我的补充</button>
        </div>
        <div v-if="!filteredHistory.length" class="empty-state"><AppIcon name="history" :size="30" /><p>这里还没有讨论记录。</p></div>
        <article v-for="entry in filteredHistory" :key="entry.id" class="history-entry" :class="{ user: entry.user }">
          <header><b>{{ entry.speaker }}</b><time>{{ formatTime(entry.time) }}</time><span>{{ entry.user ? '补充需求' : entry.topic || (entry.guest ? '嘉宾' : entry.round ? `第 ${entry.round} 句` : '主持人') }}</span></header>
          <p>{{ entry.text }}</p>
          <EvidencePanel v-if="entry.evidenceIds.length" :items="getEvidence(entry.evidenceIds)" />
        </article>
      </template>
      <template v-else-if="sheet === 'conditions'">
        <FilterFields />
        <button class="btn btn-primary" @click="closeSheet(); store.notify('条件已更新，继续讨论时会使用新条件')">保存当前条件<AppIcon name="check" :size="18" /></button>
      </template>
      <div v-else-if="sheet === 'decision'" class="decision-options" role="group" aria-label="选择今晚的饭店">
        <button v-for="restaurant in store.decisionCandidates" :key="restaurant.id" class="restaurant-choice"
          :class="{ selected: choiceId === restaurant.id }" :aria-pressed="choiceId === restaurant.id"
          @click="choiceId = restaurant.id">
          <img :src="restaurant.cover.src" :alt="restaurant.cover.alt" :style="{ objectPosition: restaurant.cover.position }" referrerpolicy="no-referrer" loading="lazy" />
          <span class="choice-copy">
            <b>{{ restaurant.name }}</b>
            <span>{{ restaurant.cuisine }} · {{ restaurant.price ? `人均 ¥${restaurant.price}` : '价格待确认' }}</span>
          </span>
          <span class="choice-mark" aria-hidden="true"><AppIcon v-if="choiceId === restaurant.id" name="check" :size="14" /></span>
        </button>
      </div>
      <div v-else-if="sheet === 'more'" class="discussion-menu">
        <button class="menu-item history" @click="sheet = 'history'">
          <span class="menu-icon"><AppIcon name="history" :size="22" /></span>
          <span>查看讨论历史</span><AppIcon class="menu-arrow" name="chevron" :size="16" />
        </button>
        <button class="menu-item conditions" @click="sheet = 'conditions'">
          <span class="menu-icon"><AppIcon name="filter" :size="22" /></span>
          <span>调整用餐条件</span><AppIcon class="menu-arrow" name="chevron" :size="16" />
        </button>
        <button class="menu-item restaurants" @click="closeSheet(); router.push('/pick')">
          <span class="menu-icon"><AppIcon name="map" :size="22" /></span>
          <span>换换心动的饭店</span><AppIcon class="menu-arrow" name="chevron" :size="16" />
        </button>
      </div>
      <template v-else-if="sheet === 'no-match'">
        <div class="empty-state">
          <AppIcon name="filter" :size="32" /><h3>新条件下，选手还需要换一换</h3>
          <p>目前没有选手符合全部硬条件。回去重新挑选，不替你将就。</p>
          <button class="btn btn-primary" @click="router.push('/pick')">重新圈定范围</button>
        </div>
      </template>
    </div>
    <template v-if="sheet === 'decision'" #footer>
      <button class="btn btn-primary" :disabled="!choice" @click="confirmDecision">就选这家<AppIcon name="check" :size="18" /></button>
    </template>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDiningStore } from '@/stores/dining'
import { useCastStore } from '@/stores/cast'
import { getEvidence } from '@/data/restaurants'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import EvidencePanel from './EvidencePanel.vue'
import FilterFields from './FilterFields.vue'

const sheet = defineModel<string>({ required: true })
const store = useDiningStore(), router = useRouter(), cast = useCastStore()
const historyRole = ref('')
const choiceId = ref('')
const choice = computed(() => store.decisionCandidates.find((restaurant) => restaurant.id === choiceId.value))
const filteredHistory = computed(() => store.history.filter((entry) => !historyRole.value || (historyRole.value === 'user' ? entry.user : entry.restaurantId === historyRole.value)))
const sheetTitles: Record<string, string> = { history: '这场饭局，聊到了这里', conditions: '今晚的用餐条件', decision: '今晚，选哪一家？', more: '这场讨论，你说了算', 'no-match': '再找一位合适的选手' }
watch(sheet, (value) => { if (value === 'decision') choiceId.value = '' })

function closeSheet() { sheet.value = '' }

// Only an explicit selection can create a result; reopening the sheet starts without a default.
function confirmDecision() {
  if (!store.decide(choiceId.value)) return
  sheet.value = ''
  void router.push('/result')
}

function formatTime(time: string) { return new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }
</script>

<style lang="less" scoped>
.debate-sheet {
  color: var(--ink);

  .history-filters { margin: 4px 0 20px; gap: 6px; .chip { padding: 8px 12px; } }
  .history-entry {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    margin-bottom: 12px;
    &.user { background: #e9eddf; }
    header {
      display: flex;
      gap: 9px;
      align-items: center;
      b { font-size: var(--label-size); }
      time { color: #a39380; font-size: var(--small-size); }
      >span { margin-left: auto; color: #9f8a70; font-size: var(--small-size); }
    }
    p { font-size: var(--body-size); line-height: var(--line-body); }
  }

  .discussion-menu {
    display: grid;
    gap: 10px;
    padding-top: 4px;

    .menu-item {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 16px;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 72px;
      padding: 13px 14px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--paper);
      color: var(--ink);
      text-align: left;
      font-size: var(--body-size);
      font-weight: var(--weight-semibold);
      transition: background .2s ease, transform .2s ease;
      &:active { transform: scale(.985); background: var(--cream); }

      .menu-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; }
      .menu-arrow { color: #a99580; }

      &.history .menu-icon { background: #f1e5d1; color: #96774c; }
      &.conditions .menu-icon { background: #e6ece2; color: #557a66; }
      &.restaurants .menu-icon { background: #ede4f0; color: #7a5a9e; }
    }
  }

  .decision-options {
    display: grid;
    gap: 10px;

    .restaurant-choice {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 22px;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--paper);
      color: var(--ink);
      text-align: left;
      transition: border-color .25s ease, background .25s ease;

      img { width: 64px; height: 64px; border-radius: 11px; object-fit: cover; }
      .choice-copy {
        min-width: 0;
        b { display: block; font-size: var(--body-size); font-weight: var(--weight-semibold); }
        >span { display: block; margin-top: 5px; color: var(--muted); font-size: var(--label-size); }
      }
      .choice-mark { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid #d8cbb7; border-radius: 50%; color: var(--ink); transition: background .25s ease, border-color .25s ease; }

      &.selected { border-color: #d6aa51; background: #faf0db; .choice-mark { background: var(--gold); border-color: var(--gold); } }
    }
  }

}
</style>
