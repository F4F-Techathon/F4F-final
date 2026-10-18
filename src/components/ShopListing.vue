<template>
  <section v-if="listing" class="shop-listing" aria-label="大众点评资料">
    <div class="scores">
      <div v-for="item in scoreItems" :key="item.label" class="score">
        <b>{{ item.value }}</b><span>{{ item.label }}</span>
      </div>
      <div class="score price"><b>{{ restaurant.price ? `¥${restaurant.price}` : '—' }}</b><span>人均</span></div>
    </div>
    <dl class="facts">
      <dt>商圈</dt><dd>{{ listing.district }} · {{ listing.region }}</dd>
      <template v-if="listing.phone"><dt>电话</dt><dd><a :href="`tel:${listing.phone}`">{{ listing.phone }}</a></dd></template>
    </dl>

    <section v-if="dishes.length" class="block">
      <h3>推荐菜 <small>{{ listing.counts.dishes }} 道</small></h3>
      <div class="dishes">
        <article v-for="dish in dishes" :key="dish.id" class="dish">
          <img v-if="dish.image" :src="dish.image" :alt="`${restaurant.name}的${dish.name}`" loading="lazy" referrerpolicy="no-referrer" @click="view([dish.image], 0)" />
          <div v-else class="no-photo" aria-hidden="true">{{ dish.name.slice(0, 1) }}</div>
          <b>{{ dish.name }}</b>
          <small>{{ dish.recommended ? `${dish.recommended} 人推荐` : '' }}{{ dish.price ? ` · ¥${dish.price}` : '' }}</small>
          <p v-if="dish.desc">{{ dish.desc }}</p>
        </article>
      </div>
    </section>

    <section v-if="deals.length" class="block">
      <h3>团购与代金券 <small>{{ listing.counts.meals + listing.counts.vouchers }} 款</small></h3>
      <ul class="deals">
        <li v-for="deal in deals" :key="deal.id">
          <span class="name">{{ deal.name }}</span>
          <span class="cost"><b v-if="deal.price != null">¥{{ deal.price }}</b><s v-if="deal.value">¥{{ deal.value }}</s></span>
          <small>{{ [deal.discount, deal.sold].filter(Boolean).join(' · ') }}</small>
        </li>
      </ul>
    </section>

    <section class="block">
      <h3>评价</h3>
      <div class="tabs" role="tablist">
        <button v-for="tab in tabs" :key="tab.id" role="tab" :aria-selected="kind === tab.id" :class="{ active: kind === tab.id }" @click="kind = tab.id">{{ tab.label }} {{ tab.count }}</button>
      </div>
      <p v-if="error" class="state">{{ error }} <button class="link" @click="load">重试</button></p>
      <p v-else-if="!detail" class="state">读取评价…</p>
      <p v-else-if="!reviews.length" class="state">暂无{{ kind === 'reviews' ? '评价' : '差评' }}</p>
      <article v-for="review in shown" :key="review.id" class="review" :class="{ complaint: kind === 'complaints' }">
        <header><b>{{ review.user }}</b><span v-if="review.star != null && kind === 'reviews'" class="stars">{{ review.star.toFixed(1) }} 星</span><time>{{ review.time }}</time></header>
        <p :class="{ clamped: !open.has(review.id) && review.text.length > 90 }" @click="toggle(review.id)">{{ review.text }}</p>
        <div v-if="review.images.length" class="photos">
          <img v-for="(src, index) in review.images.slice(0, 4)" :key="src" :src="src" :alt="`${restaurant.name}的用户照片`" loading="lazy" referrerpolicy="no-referrer" @click="view(review.images, index)" />
        </div>
      </article>
      <button v-if="reviews.length > shown.length" class="more" @click="limit += PAGE">再看 {{ Math.min(PAGE, reviews.length - shown.length) }} 条（共 {{ reviews.length }} 条）</button>
    </section>
    <p class="source">数据来自{{ listing.source }} · {{ importedOn }} 导入 · 用户昵称已隐去</p>

    <Teleport to="body">
      <div v-if="viewer" class="photo-viewer" role="dialog" aria-label="查看照片" @click="viewer = null">
        <img :src="viewer.list[viewer.index]" alt="" referrerpolicy="no-referrer" @click.stop="next" />
        <span v-if="viewer.list.length > 1">{{ viewer.index + 1 }} / {{ viewer.list.length }}</span>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { Restaurant, ShopReview } from '@/data/types'
import { importedOn, loadShopDetail, type ShopDetail } from '@/data/dianping'

// A real shop's listing on its page: scores, contact, the dishes people recommend, deals and every review.
const props = defineProps<{ restaurant: Restaurant }>()
const PAGE = 10
const listing = computed(() => props.restaurant.listing)
const detail = ref<ShopDetail | null>(null)
const error = ref('')
const kind = ref<'reviews' | 'complaints'>('reviews')
const limit = ref(PAGE)
const open = reactive(new Set<string>())
const viewer = ref<{ list: string[]; index: number } | null>(null)

const score = (value: number | null | undefined) => (value == null ? '—' : value.toFixed(1))
const scoreItems = computed(() => {
  const s = listing.value?.scores
  return [{ label: '口味', value: score(s?.taste) }, { label: '环境', value: score(s?.env) }, { label: '服务', value: score(s?.service) }]
})
const dishes = computed(() => detail.value?.dishes ?? listing.value?.dishes ?? [])
const deals = computed(() => [...(detail.value?.meals ?? listing.value?.meals ?? []), ...(detail.value?.vouchers ?? listing.value?.vouchers ?? [])])
const tabs = computed(() => [
  { id: 'reviews' as const, label: '最新评价', count: listing.value?.counts.reviews ?? 0 },
  { id: 'complaints' as const, label: '差评', count: listing.value?.counts.complaints ?? 0 },
])
const reviews = computed<ShopReview[]>(() => detail.value?.[kind.value] ?? [])
const shown = computed(() => reviews.value.slice(0, limit.value))

async function load() {
  error.value = ''
  try { detail.value = await loadShopDetail(props.restaurant.id) } catch (failure) { error.value = (failure as Error).message }
}
function toggle(id: string) { if (open.has(id)) open.delete(id); else open.add(id) }
function view(list: string[], index: number) { viewer.value = { list, index } }
function next() { if (viewer.value) viewer.value.index = (viewer.value.index + 1) % viewer.value.list.length }

watch(kind, () => { limit.value = PAGE })
watch(() => props.restaurant.id, () => { detail.value = null; void load() })
onMounted(() => { if (listing.value) void load() })
</script>

<style lang="less" scoped>
.shop-listing {
  display: flex;
  flex-direction: column;
  gap: 18px;

  .scores {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    .score {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 4px;
      border-radius: 14px;
      background: var(--paper);
      border: 1px solid var(--line);
      b { font-size: var(--heading-size); line-height: var(--line-heading); color: var(--ink); }
      span { font-size: var(--small-size); color: var(--muted); }
      &.price b { color: var(--red); }
    }
  }

  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 12px;
    margin: 0;
    font-size: var(--label-size);
    line-height: var(--line-compact);
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); white-space: pre-line; }
    a { color: var(--green); }
  }

  .block h3 {
    margin: 0 0 10px;
    font-size: var(--heading-size);
    font-weight: var(--weight-semibold);
    small { margin-left: 6px; font-size: var(--small-size); font-weight: var(--weight-regular); color: var(--muted); }
  }

  .dishes {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(132px, 38%);
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 6px;
    scroll-snap-type: x mandatory;
    .dish {
      scroll-snap-align: start;
      display: flex;
      flex-direction: column;
      gap: 3px;
      img, .no-photo { width: 100%; aspect-ratio: 4 / 3; border-radius: 12px; object-fit: cover; background: var(--cream); cursor: zoom-in; }
      .no-photo { display: grid; place-items: center; font-size: var(--section-size); color: var(--muted); cursor: default; }
      b { font-size: var(--label-size); line-height: var(--line-compact); }
      small { font-size: var(--small-size); color: var(--muted); }
      p { margin: 0; font-size: var(--small-size); line-height: var(--line-compact); color: #5d4c58; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    }
  }

  .deals {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--paper);
      border: 1px solid var(--line);
      .name { font-size: var(--label-size); line-height: var(--line-compact); }
      .cost { display: flex; align-items: baseline; gap: 6px; b { color: var(--red); } s { color: var(--muted); font-size: var(--small-size); } }
      small { grid-column: 1 / -1; font-size: var(--small-size); color: var(--muted); }
    }
  }

  .tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
    button {
      padding: 6px 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--paper);
      color: var(--muted);
      font-size: var(--small-size);
      &.active { background: var(--ink); border-color: var(--ink); color: var(--paper); }
    }
  }
  .state { margin: 6px 0; font-size: var(--small-size); color: var(--muted); }
  .link { border: 0; background: none; color: var(--green); text-decoration: underline; padding: 0; }

  .review {
    padding: 12px 0;
    border-top: 1px solid var(--line);
    header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: var(--small-size);
      b { color: var(--ink); }
      .stars { color: var(--gold); }
      time { margin-left: auto; color: var(--muted); }
    }
    p {
      margin: 6px 0 0;
      font-size: var(--label-size);
      line-height: var(--line-compact);
      white-space: pre-line;
      &.clamped { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
    }
    &.complaint header b::after { content: '差评'; margin-left: 6px; padding: 0 6px; border-radius: 6px; background: #f6dcd6; color: var(--red); font-weight: var(--weight-regular); }
    .photos {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
      img { width: 100%; aspect-ratio: 1; border-radius: 10px; object-fit: cover; background: var(--cream); cursor: zoom-in; }
    }
  }
  .more {
    width: 100%;
    margin-top: 6px;
    padding: 10px;
    border: 1px dashed var(--line);
    border-radius: 12px;
    background: transparent;
    color: var(--ink);
    font-size: var(--small-size);
  }
  .source { margin: 0; font-size: var(--small-size); color: var(--muted); }
}

.photo-viewer {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  background: #120a17e6;
  img { max-width: min(94vw, 900px); max-height: 86dvh; border-radius: 12px; object-fit: contain; }
  span { position: absolute; bottom: calc(24px + env(safe-area-inset-bottom)); color: var(--paper); font-size: var(--small-size); }
}
</style>
