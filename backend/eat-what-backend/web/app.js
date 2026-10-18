import { createKitRig } from "/assets/rigkit.js";
import { VoiceRoom } from "/assets/voice-room.js";

const $ = (selector) => document.querySelector(selector);
const sessionId = localStorage.getItem("eatwhat-session") || `demo-${crypto.randomUUID().slice(0, 8)}`;
localStorage.setItem("eatwhat-session", sessionId);

let characterManifest = null;
const accents = { rong: "var(--rong)", hua: "var(--hua)", pierre: "var(--pierre)", host: "var(--gold)" };
const state = { snapshot: null, config: null, rigs: new Map(), cards: new Map(), messages: new Map(), selectedAgentId: null, liveRoom: null, live: false, busy: false };
let playbackVersion = 0;
let finishSpeech = null;
let narrationEnabled = false;
let discussionPaused = false;
const voiceClient = new VoiceRoom({
  onEvent: handleEvent,
  onConnection: (connected) => {
    state.live = connected;
    state.liveRoom = voiceClient.room;
    updateConnection();
    $("#voice-connect").textContent = connected ? "结束语音" : "开始语音对话";
    for (const id of ["#voice-mute", "#voice-interrupt", "#voice-resume"]) $(id).hidden = !connected;
    $("#voice-toggle").hidden = connected;
    $("#mic-button").classList.toggle("listening", connected);
    if (!connected) stopPlayback();
  },
  onStatus: (text) => { $("#voice-status").textContent = text; },
});

function stopPlayback() {
  playbackVersion += 1;
  finishSpeech?.();
  window.speechSynthesis?.cancel();
  state.cards.forEach((card, id) => {
    card.classList.remove("speaking");
    state.rigs.get(id)?.setSpeaking(false);
  });
}

function roleAsset(assetId) {
  return characterManifest?.roles?.[assetId] || characterManifest?.roles?.hua;
}

function visualStateFor(assetId, requested) {
  const allowed = characterManifest?.states || ["idle"];
  return roleAsset(assetId) && allowed.includes(requested) ? requested : "idle";
}

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2400);
}

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

function actorName(agentId) {
  if (agentId === "user") return "你";
  if (agentId === "host") return "主持人";
  const all = [...(state.snapshot?.active || []), ...(state.snapshot?.holding || []), ...(state.snapshot?.removed || [])];
  return all.find((item) => item.agentId === agentId)?.shortName || agentId;
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  const stage = $("#stage");
  stage.innerHTML = "";
  state.rigs.clear();
  state.cards.clear();
  if (!snapshot.active.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chip";
    empty.textContent = "候选餐厅都已离场，可以点击「重新开始」重新选择。";
    stage.append(empty);
  }
  for (const restaurant of snapshot.active) {
    const card = document.createElement("article");
    card.className = "agent-card";
    card.style.setProperty("--accent", accents[restaurant.agentId]);
    card.innerHTML = `
      <div class="agent-meta"><div><b></b><small></small></div>${restaurant.isDemo ? '<span class="demo-badge">演示数据</span>' : ""}</div>
      <div class="character"></div><div class="bubble"></div>
      <div class="agent-footer"><span></span><strong></strong></div>`;
    card.querySelector(".agent-meta b").textContent = restaurant.shortName;
    card.querySelector(".agent-meta small").textContent = restaurant.cuisine;
    card.querySelector(".agent-footer span").textContent = restaurant.district;
    card.querySelector(".agent-footer strong").textContent = `¥${restaurant.avgPrice}/人`;
    const character = card.querySelector(".character");
    const rig = createKitRig(character, roleAsset(restaurant.assetId).look, `agent-${restaurant.agentId}`);
    stage.append(card);
    state.rigs.set(restaurant.agentId, rig);
    state.cards.set(restaurant.agentId, card);
    if (state.selectedAgentId === restaurant.agentId) {
      card.classList.add("selected");
      rig.setState("selected");
    }
  }
  const holding = $("#holding-list");
  holding.innerHTML = "";
  for (const restaurant of snapshot.holding) {
    const item = document.createElement("div");
    item.className = "holding-card";
    item.innerHTML = `<div><b></b><small></small></div><span class="demo-badge">候场</span>`;
    item.querySelector("b").textContent = restaurant.shortName;
    item.querySelector("small").textContent = `${restaurant.cuisine} · ¥${restaurant.avgPrice}`;
    holding.append(item);
  }
  if (!snapshot.holding.length) holding.innerHTML = '<span class="empty-chip">没有其他候选</span>';
  renderProfile(snapshot.profile);
}

function renderProfile(profile) {
  const target = $("#profile-chips");
  const chips = [];
  if (profile.budget) chips.push(`预算 ¥${profile.budget}`);
  for (const item of profile.cuisines || []) chips.push(item);
  for (const item of profile.allergies || []) chips.push(`${item}过敏`);
  if (profile.occasion) chips.push(profile.occasion);
  target.innerHTML = "";
  if (!chips.length) target.innerHTML = '<span class="empty-chip">还没有形成偏好</span>';
  for (const text of chips) {
    const chip = document.createElement("span");
    chip.textContent = text;
    target.append(chip);
  }
}

function addMessage(turn) {
  if (state.messages.has(turn.turnId)) return state.messages.get(turn.turnId);
  const article = document.createElement("article");
  article.className = "message";
  if (turn.speakerId === "user") article.classList.add("user-message");
  article.style.setProperty("--accent", accents[turn.speakerId] || "#8a8292");
  article.innerHTML = `<header><b></b><span></span></header><p></p><div class="evidence-buttons"></div>`;
  article.querySelector("header b").textContent = actorName(turn.speakerId);
  article.querySelector("header span").textContent = turn.speechAct;
  article.querySelector("p").textContent = turn.text;
  $("#conversation").append(article);
  state.messages.set(turn.turnId, article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return article;
}

async function speakInDemo(turn) {
  if (state.live || voiceClient.room || turn.speakerId === "host") return;
  if (!narrationEnabled || !("speechSynthesis" in window)) {
    await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(done, 1100);
      function done() { if (settled) return; settled = true; clearTimeout(timer); finishSpeech = null; resolve(); }
      finishSpeech = done;
    });
    return;
  }
  window.speechSynthesis.cancel();
  await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(done, Math.min(35000, turn.text.length * 300 + 4000));
    function done() { if (settled) return; settled = true; clearTimeout(timer); finishSpeech = null; resolve(); }
    finishSpeech = done;
    const utterance = new SpeechSynthesisUtterance(turn.text);
    utterance.lang = "zh-CN";
    utterance.rate = turn.speakerId === "pierre" ? 0.92 : 1.02;
    utterance.pitch = turn.speakerId === "rong" ? 1.12 : turn.speakerId === "hua" ? 0.86 : 1;
    utterance.onend = done;
    utterance.onerror = done;
    speechSynthesis.speak(utterance);
  });
}

async function handleEvent(event) {
  const payload = event.payload || {};
  if (event.type === "host.note") {
    $("#host-copy").textContent = payload.turn.text;
    if (payload.turn.speechAct === "conclude") {
      addMessage(payload.turn);
      await handleEvent({ type: "evidence.available", payload: { turnId: payload.turn.turnId, evidence: payload.evidence || [] } });
    }
  }
  if (event.type === "voice.discussion") {
    discussionPaused = payload.paused;
    $("#voice-interrupt").textContent = discussionPaused ? "继续讨论" : "暂停讨论";
    if (discussionPaused) $("#voice-status").textContent = payload.reason === "no_candidates"
      ? "没有剩余候选，可以重新开始选择" : "讨论已暂停 · 可以说「继续」或提出新要求";
  }
  if (event.type === "room.snapshot") {
    renderSnapshot(payload);
    if (payload.degradedReason) toast("模型不可用，已使用可验证规则兜底");
  }
  if (event.type === "roster.changed" && payload.snapshot) renderSnapshot(payload.snapshot);
  if (event.type === "profile.updated") renderProfile(payload.profile);
  if (event.type === "user.transcript") {
    $("#message-input").value = "";
    addMessage({ turnId: payload.turnId || `user-${crypto.randomUUID()}`, speakerId: "user", text: payload.text, speechAct: "语音" });
  }
  if (event.type === "user.speech_started") {
    stopPlayback();
    state.selectedAgentId = null;
    state.cards.forEach(card => card.classList.remove("selected"));
    $("#voice-status").textContent = "正在听你说…";
  }
  if (event.type === "voice.state") {
    const phases = { thinking: "正在组织回复…", transcribing: "正在识别你的话…", listening: "持续聆听中，可直接说话" };
    $("#voice-status").textContent = phases[payload.state] || payload.state;
  }
  if (event.type === "voice.error") {
    $("#voice-status").textContent = payload.message;
  }
  if (event.type === "session.reset") {
    $("#conversation").innerHTML = "";
    state.messages.clear();
    state.selectedAgentId = null;
  }
  if (event.type === "speech.interrupted") {
    stopPlayback();
    state.cards.forEach((card, id) => { card.classList.remove("speaking"); state.rigs.get(id)?.setSpeaking(false); });
    const notices = {
      tts_unavailable: "语音合成不可用，已保留字幕",
      stt_unavailable: "语音识别不可用，请暂时用文字输入",
      user_speech_started: "已打断，正在听你说",
    };
    if (notices[payload.reason]) $("#voice-status").textContent = notices[payload.reason];
  }
  if (event.type === "speech.started") {
    const turn = payload.turn;
    if (state.live) $("#voice-status").textContent = `${actorName(turn.speakerId)}正在发言 · 说话即可打断`;
    addMessage(turn);
    if (turn.speakerId === "host") $("#host-copy").textContent = turn.text;
    const card = state.cards.get(turn.speakerId);
    const rig = state.rigs.get(turn.speakerId);
    state.cards.forEach((other, id) => { if (id !== turn.speakerId) other.classList.remove("speaking"); });
    if (card && rig) {
      card.querySelector(".bubble").textContent = turn.text;
      card.classList.add("speaking");
      const restaurant = state.snapshot.active.find((item) => item.agentId === turn.speakerId);
      rig.setState(visualStateFor(restaurant?.assetId, turn.visualState));
      rig.setSpeaking(true);
    }
    await speakInDemo(turn);
  }
  if (event.type === "speech.ended") {
    const card = state.cards.get(payload.speakerId);
    const rig = state.rigs.get(payload.speakerId);
    if (card && rig) {
      card.classList.remove("speaking");
      rig.setSpeaking(false);
      rig.setState("idle");
    }
  }
  if (event.type === "evidence.available") {
    const message = state.messages.get(payload.turnId);
    const holder = message?.querySelector(".evidence-buttons");
    for (const evidence of payload.evidence || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = evidence.isDemo ? "模拟证据" : `原评 · ${evidence.sourceRow}行`;
      button.onclick = () => openEvidence(evidence.id);
      holder?.append(button);
    }
  }
  if (event.type === "decision.final") {
    state.selectedAgentId = payload.turn?.targetAgentId || null;
    state.cards.forEach((card, id) => {
      const selected = id === state.selectedAgentId;
      card.classList.toggle("selected", selected);
      if (selected) state.rigs.get(id)?.setState("selected");
    });
  }
}

async function runEvents(events, version) {
  for (const event of events) {
    if (version !== playbackVersion) return;
    await handleEvent(event);
  }
}

async function sendText(text) {
  const cleaned = text.trim();
  if (!cleaned || state.busy) return;
  stopPlayback();
  const version = playbackVersion;
  state.busy = true;
  state.selectedAgentId = null;
  $("#turn-status").textContent = "正在整理你的要求…";
  addMessage({ turnId: `user-${crypto.randomUUID()}`, speakerId: "user", text: cleaned, speechAct: "新要求" });
  $("#message-input").value = "";
  try {
    if (state.live && state.liveRoom) {
      await voiceClient.send("ui.intent", { text: cleaned });
    } else {
      const result = await api("/api/demo/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, text: cleaned }) });
      if (version !== playbackVersion) return;
      state.busy = false;
      renderSnapshot(result.snapshot);
      $("#turn-status").textContent = "餐厅讨论中 · 可随时插话";
      await runEvents(result.events, version);
      if (version !== playbackVersion) return;
      renderSnapshot(result.snapshot);
      if (result.degradedReason) toast("模型不可用，已使用可验证规则兜底");
    }
  } catch (error) {
    toast(error.message || "发送失败");
  } finally {
    if (version === playbackVersion) {
      state.busy = false;
      $("#turn-status").textContent = "准备就绪 · 随时输入新要求";
    }
  }
}

async function openEvidence(evidenceId) {
  try {
    const { evidence, restaurant } = await api(`/api/evidence/${encodeURIComponent(evidenceId)}`);
    const box = $("#evidence-content");
    box.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = restaurant.shortName;
    const source = document.createElement("div");
    source.className = "source";
    source.textContent = evidence.isDemo ? "模拟评论，用于功能演示" : `${evidence.sourceSheet} · 原表第 ${evidence.sourceRow} 行`;
    const quote = document.createElement("blockquote");
    // Evidence offsets are generated by Python and therefore count Unicode
    // code points. Array.from keeps emoji from being split into UTF-16 halves.
    const sourcePoints = Array.from(evidence.sourceText);
    const start = Math.max(0, evidence.highlightStart);
    const end = Math.min(sourcePoints.length, evidence.highlightEnd);
    quote.append(document.createTextNode(sourcePoints.slice(0, start).join("")));
    const mark = document.createElement("mark");
    mark.textContent = sourcePoints.slice(start, end).join("") || evidence.quote;
    quote.append(mark, document.createTextNode(sourcePoints.slice(end).join("")));
    box.append(title, source, quote);
    $("#evidence-dialog").showModal();
  } catch (error) { toast(error.message); }
}

async function connectLiveKit() {
  if (!state.config.livekitConfigured) {
    toast("尚未配置 LiveKit，当前使用本地演示模式");
    return;
  }
  if (voiceClient.room) {
    await voiceClient.disconnect();
    return;
  }
  try {
    stopPlayback();
    await voiceClient.connect(sessionId);
  } catch (error) {
    $("#voice-status").textContent = `语音连接失败：${error.message}`;
  }
}

function updateConnection() {
  const button = $("#connection-status");
  button.classList.toggle("live", state.live);
  button.querySelector("span").textContent = state.live ? "LiveKit 实时" : state.config?.livekitConfigured ? "语音未连接" : "本地演示";
}

function startSpeechInput() {
  if (state.config.livekitConfigured) {
    if (state.live) $("#voice-mute").click();
    else connectLiveKit();
    return;
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (state.live) {
    toast("LiveKit 已持续监听，可直接说话");
    return;
  }
  if (!Recognition) {
    toast("当前浏览器不支持语音识别，请使用文字输入");
    return;
  }
  finishSpeech?.();
  window.speechSynthesis?.cancel();
  const recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  $("#mic-button").classList.add("listening");
  recognition.onresult = (event) => {
    const text = [...event.results].map((result) => result[0].transcript).join("");
    $("#message-input").value = text;
    if (event.results[event.results.length - 1].isFinal) sendText(text);
  };
  recognition.onerror = () => toast("没有识别到语音");
  recognition.onend = () => $("#mic-button").classList.remove("listening");
  recognition.start();
}

async function init() {
  characterManifest = await api("/assets/characters/manifest.json");
  const initial = await api(`/api/session/bootstrap?session_id=${encodeURIComponent(sessionId)}`);
  state.config = initial.config;
  renderSnapshot(initial.snapshot);
  updateConnection();
  const voiceStatus = await api("/api/voice/status").catch(() => null);
  $("#voice-status").textContent = voiceStatus?.worker?.ready
    ? "语音服务已就绪 · 点击开始后允许麦克风"
    : "语音服务正在准备，请稍后重试";
  $("#voice-connect").addEventListener("click", connectLiveKit);
  $("#voice-mute").addEventListener("click", async () => {
    try { const muted = await voiceClient.mute(); $("#voice-mute").textContent = muted ? "恢复麦克风" : "静音麦克风"; }
    catch (error) { $("#voice-status").textContent = error.message; }
  });
  $("#voice-interrupt").addEventListener("click", () => voiceClient.send("ui.discussion", { paused: !discussionPaused }).catch(error => toast(error.message)));
  $("#voice-resume").addEventListener("click", () => voiceClient.resumeAudio().catch(error => toast(error.message)));
  $("#composer-form").addEventListener("submit", (event) => { event.preventDefault(); sendText($("#message-input").value); });
  $("#quick-actions").addEventListener("click", (event) => { const text = event.target.dataset.text; if (text) sendText(text); });
  $("#connection-status").addEventListener("click", connectLiveKit);
  $("#mic-button").addEventListener("click", startSpeechInput);
  $("#voice-toggle").addEventListener("click", () => {
    narrationEnabled = !narrationEnabled;
    $("#voice-toggle").textContent = `朗读：${narrationEnabled ? "开" : "关"}`;
    $("#voice-toggle").setAttribute("aria-pressed", String(narrationEnabled));
    if (!narrationEnabled) { finishSpeech?.(); window.speechSynthesis?.cancel(); }
  });
  $("#close-evidence").addEventListener("click", () => $("#evidence-dialog").close());
  $("#reset-button").addEventListener("click", async () => {
    stopPlayback();
    state.busy = true;
    try {
      if (state.live) { await voiceClient.send("ui.reset"); return; }
      const result = await api("/api/session/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }) });
      $("#conversation").innerHTML = "";
      state.messages.clear();
      state.selectedAgentId = null;
      renderSnapshot(result.snapshot);
      $("#host-copy").textContent = "已清空这次讨论。重新告诉我你今晚想吃什么。";
    } catch (error) { toast(error.message || "重新开始失败"); }
    finally {
      state.busy = false;
      $("#turn-status").textContent = "准备就绪 · 随时输入新要求";
    }
  });
}

init().catch((error) => toast(`启动失败：${error.message}`));
