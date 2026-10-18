<template>
  <Transition name="peek">
    <aside v-if="open" ref="panel" class="stage-peek" role="dialog" :aria-labelledby="titleId" @keydown.esc="$emit('close')">
      <header>
        <div class="peek-avatar" :style="{ '--peek-color': color }">
          <HostAvatar v-if="restaurant" :restaurant="restaurant" portrait />
          <CharacterAvatar v-else-if="guest" :figure="{ kind: 'kit', look: guest.look }" :name="guest.name" portrait />
          <GuideOrb v-else small />
        </div>
        <div class="peek-title">
          <small>{{ restaurant ? `${cast.hostNameOf(restaurant)} 代表` : guest ? `嘉宾 ${guest.name} 代表` : '主持人' }}</small>
          <h2 :id="titleId">{{ restaurant?.name || guest?.restaurant || hostName }}</h2>
        </div>
        <button ref="closeButton" class="icon-btn" aria-label="关闭店铺资料" @click="$emit('close')"><AppIcon name="close" :size="18" /></button>
      </header>

      <div class="peek-content">
        <template v-if="restaurant">
          <div class="peek-cover" :class="{ photo: restaurant.cover.remote }">
            <img v-if="restaurant.cover.remote" :src="restaurant.cover.src" :alt="restaurant.cover.alt" referrerpolicy="no-referrer" loading="lazy" />
            <RestaurantArt v-else :name="restaurant.name" :color="restaurant.color" />
            <span class="badge">{{ restaurant.listing ? restaurant.listing.source : '演示餐厅' }}</span>
          </div>
          <p class="meta">{{ restaurant.cuisine }} <i>·</i> {{ restaurant.price ? `人均 ¥${restaurant.price}` : '人均价格未知' }} <i>·</i> 直线 {{ store.distance(restaurant.id) }} km</p>
          <div v-if="restaurant.tags.length" class="chips"><span v-for="tag in restaurant.tags" :key="tag" class="chip green">{{ tag }}</span></div>
          <dl class="facts">
            <dt><AppIcon name="clock" :size="15" />营业时间</dt><dd>{{ restaurant.hours || '暂无可靠营业信息，请向商家确认' }}</dd>
            <dt><AppIcon name="pin" :size="15" />地址</dt><dd>{{ restaurant.address }}</dd>
          </dl>
          <blockquote v-if="restaurant.intro" class="host-say"><b>{{ cast.hostNameOf(restaurant) }}说</b>“{{ restaurant.intro }}”</blockquote>
          <section v-if="highlights.length" class="highlights">
            <h3>这家的亮点</h3>
            <p v-for="item in highlights" :key="item.title"><AppIcon name="check" :size="13" /><span><b>{{ item.title }}</b><small>{{ item.description }}</small></span></p>
          </section>
          <p v-if="restaurant.caveat" class="caveat">{{ restaurant.caveat }}</p>
          <ShopListing v-if="restaurant.listing" :key="restaurant.id" :restaurant="restaurant" />
          <section v-else-if="reviews.length" class="highlights">
            <h3>用餐体验 <small>演示评价</small></h3>
            <blockquote v-for="review in reviews" :key="review.id" class="review">{{ review.text }}</blockquote>
          </section>
        </template>

        <template v-else-if="guest">
          <p class="meta">{{ guest.cuisine || '品牌嘉宾' }} <i>·</i> 招牌 {{ guest.plate }}</p>
          <div v-if="guest.keywords?.length" class="chips"><span v-for="word in guest.keywords" :key="word" class="chip purple">{{ word }}</span></div>
          <blockquote v-if="guest.greeting" class="host-say"><b>{{ guest.name }}说</b>“{{ guest.greeting }}”</blockquote>
          <section class="highlights">
            <h3>人设</h3>
            <p class="persona">{{ guest.persona }}</p>
          </section>
          <p class="caveat">嘉宾由导演台请上台，不在这次的候选店铺里，没有地址和点评资料。</p>
        </template>

        <template v-else>
          <p class="persona">我是今晚的主持人 {{ hostName }}，不代表任何一家店。我负责串场、点名，把你的要求转给台上的选手。点台上任意一位选手，就能看看这位代表的店。</p>
          <div class="roster">
            <button v-for="item in others" :key="item.id" class="roster-item" @click="$emit('select', item.id)">
              <span class="dot" :style="{ background: item.color }"></span>
              <b>{{ item.name }}</b><small>{{ item.shop }}</small>
              <AppIcon name="chevron" :size="14" />
            </button>
          </div>
        </template>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import type { Restaurant } from '@/data/types'
import type { StageGuest } from '@/agents/stage/lineup'
import { evidence } from '@/data/restaurants'
import { restaurantHighlights } from '@/lib/restaurantHighlights'
import { useCastStore } from '@/stores/cast'
import { useDiningStore } from '@/stores/dining'
import AppIcon from './AppIcon.vue'
import CharacterAvatar from './CharacterAvatar.vue'
import GuideOrb from './GuideOrb.vue'
import HostAvatar from './HostAvatar.vue'
import RestaurantArt from './RestaurantArt.vue'
import ShopListing from './ShopListing.vue'

export interface PeekRosterItem { id: string; name: string; shop: string; color: string }

// Beside the stage, not over it: who a tapped performer speaks for, while the stage stays in view and another
// performer can be tapped to switch. The host has no shop, so it lists the others.
const props = defineProps<{
  open: boolean
  restaurant?: Restaurant
  guest?: StageGuest
  hostName: string
  others: PeekRosterItem[]
}>()
defineEmits<{ close: []; select: [id: string] }>()

const store = useDiningStore(), cast = useCastStore()
const titleId = useId()
const panel = ref<HTMLElement>(), closeButton = ref<HTMLButtonElement>()
const color = computed(() => props.restaurant?.color || props.guest?.color || '#c9b3f2')
const highlights = computed(() => props.restaurant ? restaurantHighlights(props.restaurant, store.filters) : [])
const reviews = computed(() => evidence.filter((item) => item.restaurantId === props.restaurant?.id && item.kind === 'review'))

// Whoever opened it lands on it; switching performers starts the new shop from the top.
watch(() => [props.open, props.restaurant?.id, props.guest?.id], async ([open], before) => {
  if (!open) return
  await nextTick()
  panel.value?.querySelector('.peek-content')?.scrollTo({ top: 0 })
  if (!before?.[0]) closeButton.value?.focus({ preventScroll: true })
})
</script>

<style lang="less" scoped>
.stage-peek {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  color: var(--ink);
  // Phones: a sheet from the bottom that leaves the stage above it in view.
  left: 0;
  right: 0;
  bottom: 0;
  height: min(54dvh, 560px);
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -14px 50px #0c06104d;
  padding-bottom: env(safe-area-inset-bottom);

  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px var(--inset-right) 10px var(--inset-left);
    border-bottom: 1px solid var(--line);

    .peek-avatar {
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 16px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--peek-color) 22%, #fff9ef);
      :deep(.guide-orb) { width: 40px; height: 40px; }
    }
    .peek-title {
      flex: 1;
      min-width: 0;
      small { display: block; color: var(--muted); font-size: var(--small-size); }
      h2 { margin: 2px 0 0; font-size: var(--section-size); line-height: var(--line-heading); overflow-wrap: anywhere; }
    }
    .icon-btn { flex: none; width: 40px; height: 40px; background: var(--cream); }
  }

  .peek-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 14px var(--inset-right) 28px var(--inset-left);
  }

  .peek-cover {
    position: relative;
    height: 150px;
    border-radius: 16px;
    overflow: hidden;
    background: #e9e1cc;
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .badge {
      position: absolute;
      left: 10px;
      top: 10px;
      padding: 3px 9px;
      border-radius: 20px;
      background: #fff9efe6;
      font-size: var(--small-size);
      color: #6c5a50;
    }
  }

  .meta {
    margin: 12px 0 10px;
    font-size: var(--label-size);
    color: #6c5a50;
    i { font-style: normal; color: #c2b2a0; margin: 0 2px; }
  }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; .chip { min-height: 28px; padding: 4px 10px; } }

  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 0 0 14px;
    font-size: var(--small-size);
    line-height: var(--line-body);
    dt { display: flex; align-items: center; gap: 5px; color: var(--muted); white-space: nowrap; }
    dd { margin: 0; overflow-wrap: anywhere; }
  }

  .host-say {
    margin: 0 0 14px;
    padding: 12px 14px;
    border-radius: 14px;
    background: #f3ead9;
    font-size: var(--label-size);
    line-height: var(--line-body);
    b { display: block; margin-bottom: 3px; font-size: var(--small-size); color: var(--muted); }
  }

  .highlights {
    margin-bottom: 14px;
    h3 { margin: 0 0 8px; font-size: var(--body-size); small { font-weight: var(--weight-regular); color: var(--muted); font-size: var(--small-size); } }
    p { display: flex; gap: 8px; margin: 0 0 8px; font-size: var(--small-size); line-height: var(--line-body);
      :deep(svg) { flex: none; margin-top: 4px; color: var(--green); }
      b { display: block; } small { color: var(--muted); } }
    .review { margin: 0 0 8px; padding: 10px 12px; border-left: 3px solid #e2d2b8; font-size: var(--small-size); line-height: var(--line-body); }
  }
  .persona { font-size: var(--label-size); line-height: var(--line-body); margin: 0 0 14px; }
  .caveat { margin: 0 0 14px; padding: 10px 12px; border-radius: 12px; background: #f6efe2; color: #7d6a5d; font-size: var(--small-size); line-height: var(--line-body); }

  .roster { display: flex; flex-direction: column; gap: 6px; }
  .roster-item {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 46px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #fffdf8;
    text-align: left;
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    b { font-size: var(--label-size); }
    small { flex: 1; min-width: 0; color: var(--muted); font-size: var(--small-size); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  // Wide screens: a drawer at the side; the debate page makes room for it.
  @media (min-width: 900px) {
    left: auto;
    top: 0;
    height: auto;
    width: var(--peek-width, 400px);
    border-radius: 0;
    box-shadow: -14px 0 50px #0c06104d;
  }
}

.peek-enter-active, .peek-leave-active { transition: transform .32s cubic-bezier(.22, .61, .36, 1), opacity .32s; }
.peek-enter-from, .peek-leave-to { transform: translateY(40px); opacity: 0; }
@media (min-width: 900px) {
  .peek-enter-from, .peek-leave-to { transform: translateX(40px); }
}
@media (prefers-reduced-motion: reduce) {
  .peek-enter-active, .peek-leave-active { transition: opacity .2s; }
  .peek-enter-from, .peek-leave-to { transform: none; }
}
</style>
