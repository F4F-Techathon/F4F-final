<template>
  <div class="system">
    <h1>系统</h1>
    <p class="sub">多智能体后端（在线时）经手机驱动辩论并配音，它的每一句都镜像到舞台中继；导演台发同样的舞台消息，可以补发、插话、请嘉宾。手机按顺序上演，Jev 决定每一句怎么演，再把状态和决策报回来。台词或生成经过时，对应的节点会亮。</p>
    <Diagram />
    <div class="sysstat">
      <span class="pill" :class="director.status.value === 'open' ? 'ok' : 'warn'"><i></i>舞台中继 · {{ FEED_LABELS[director.status.value] }} · {{ director.peers.value?.console ?? 0 }} 个控制台</span>
      <span class="pill" :class="phones === 1 ? 'ok' : 'warn'"><i></i>{{ phones ? `手机 · ${phones} 台在线${phase ? ` · ${PHASE_LABELS[phase]}` : ''}${phones > 1 ? ' · 每台都会上演' : ''}` : '手机未连接' }}</span>
      <template v-if="status">
        <span class="pill" :class="status.jev.configured ? 'ok' : 'warn'"><i></i>{{ status.jev.configured ? `Jev · ${status.jev.model}` : 'Jev 未配置 · 关键词基线' }}</span>
        <span class="pill" :class="status.llm.configured || status.llm.fallback?.configured ? 'ok' : 'warn'"><i></i>{{ status.llm.configured ? `意图解析 · ${status.llm.model}` : '意图解析未配置' }}{{ status.llm.fallback?.configured ? ` · 备用 ${status.llm.fallback.model}` : status.llm.fallback?.model ? ' · 备用待配置' : '' }}</span>
        <span class="pill" :class="status.amap.configured ? 'ok' : 'warn'"><i></i>{{ status.amap.configured ? '高德地图 · 已配置' : '高德地图未配置' }}</span>
        <span class="pill" :class="status.proxy.configured ? 'ok' : ''"><i></i>{{ status.proxy.configured ? '网络代理 · 已设置' : '网络代理 · 未设置' }}</span>
        <span class="pill" :class="status.agents?.reachable ? 'ok' : 'warn'"><i></i>{{ status.agents?.reachable ? `多智能体后端 · 在线 · ${status.agents.model ?? '模型未配置'}` : '多智能体后端未连接 · 由导演台驱动' }}</span>
        <span class="pill" :class="voice.on ? 'ok' : 'warn'"><i></i>{{ voice.on ? `语音 · ${voice.name}` : '语音未接入' }}</span>
      </template>
      <span v-else class="pill bad"><i></i>{{ service.error || '服务状态读取中' }}</span>
    </div>
    <div class="valbar"><h2>名册</h2><span class="sp"></span><small>每位 agent 一份资产契约：形象 · 口音 · 默认表演 · 来源</small></div>
    <RegistryTable />
    <CheckPanel />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useDirector } from '../core/director.ts'
import { FEED_LABELS, PHASE_LABELS } from '../core/labels.ts'
import { service, voiceOf } from '../core/status.ts'
import CheckPanel from './CheckPanel.vue'
import Diagram from './Diagram.vue'
import RegistryTable from './RegistryTable.vue'

// 系统: the architecture as it runs, what the app server has set up, every agent's contract, and the Jev check.
defineProps<{ active: boolean }>()
const director = useDirector()
const status = computed(() => service.status)
const voice = computed(() => voiceOf(service.status))
const phones = computed(() => director.peers.value?.app ?? 0)
const phase = computed(() => director.state.snapshot?.phase)
</script>
