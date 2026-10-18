// Bundled LiveKit SDK: no external CDN is needed during a call.
export class VoiceRoom {
  constructor({ onEvent, onConnection, onStatus }) {
    Object.assign(this, { onEvent, onConnection, onStatus });
    this.room = null;
    this.audio = new Set();
    this.muted = false;
    this.connecting = false;
    this.readyTimer = null;
    this.workerReady = false;
    this.ensureEpoch = 0;
  }
  async send(type, payload = {}) {
    if (!this.room) throw new Error("语音连接尚未建立");
    await this.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type, payload })),
      { reliable: true, topic: "ui-control" });
  }
  async connect(sessionId) {
    if (this.room || this.connecting) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("麦克风需要 localhost 或 HTTPS 页面");
    this.connecting = true;
    const LK = window.LivekitClient;
    const room = new LK.Room({ adaptiveStream: true, dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.room = room;
    this.onStatus("正在连接本机语音服务…");
    room.on(LK.RoomEvent.DataReceived, (bytes, _participant, _kind, topic) => {
      if (topic !== "orchestrator") return;
      try {
        const event = JSON.parse(new TextDecoder().decode(bytes));
        if (event.type === "voice.ready") {
          this.workerReady = true;
          clearTimeout(this.readyTimer);
          this.onStatus("餐厅自动讨论中 · 你可以随时插话");
        }
        if (["user.speech_started", "speech.interrupted"].includes(event.type)) this.audio.forEach(el => { el.muted = true; });
        if (event.type === "speech.started") this.audio.forEach(el => { el.muted = false; });
        Promise.resolve(this.onEvent(event)).catch(error => this.onStatus(error.message));
      } catch (error) { this.onStatus(`语音事件错误：${error.message}`); }
    });
    room.on(LK.RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== LK.Track.Kind.Audio) return;
      const el = track.attach();
      el.dataset.voiceAudio = "true";
      document.body.append(el);
      this.audio.add(el);
      el.play().catch(() => this.onStatus("声音被浏览器暂停，请点击「播放声音」"));
    });
    room.on(LK.RoomEvent.TrackUnsubscribed, track => track.detach().forEach(el => { this.audio.delete(el); el.remove(); }));
    room.on(LK.RoomEvent.Reconnecting, () => { this.workerReady = false; this.onStatus("连接中断，正在重新连接…"); });
    room.on(LK.RoomEvent.Reconnected, () => {
      this.onStatus("正在恢复餐厅讨论…");
      this.ensureWorker(sessionId).catch(error => this.onStatus(error.message));
    });
    room.on(LK.RoomEvent.Disconnected, () => this.cleanup());
    try {
      await room.startAudio();
      this.onStatus("请允许本机页面使用麦克风…");
      // Obtain microphone permission before ICE gathering, so the browser can
      // expose the local candidates needed by a loopback LiveKit server.
      this.microphone = await LK.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      const response = await fetch(`/api/livekit/token?room=${encodeURIComponent(sessionId)}`);
      const credentials = await response.json();
      if (!response.ok) throw new Error(credentials.detail || "获取语音凭证失败");
      await room.connect(credentials.url, credentials.token);
      this.onConnection(true);
      this.onStatus("正在启用麦克风并等待主持人…");
      await room.localParticipant.publishTrack(this.microphone, { source: LK.Track.Source.Microphone });
      this.muted = false;
      if (!this.workerReady) this.readyTimer = setTimeout(() => {
        if (!this.workerReady) this.onStatus("语音后台暂未就绪，请重新连接");
      }, 30000);
      await this.send("ui.sync");
      this.ensureWorker(sessionId).catch(error => this.onStatus(error.message));
    } catch (error) {
      await room.disconnect(); this.cleanup();
      const messages = { NotAllowedError: "麦克风未获授权，请允许本机页面使用麦克风后重试",
        NotFoundError: "没有找到麦克风，请连接设备后重试", NotReadableError: "麦克风被其他程序占用" };
      throw new Error(messages[error.name] || error.message);
    } finally { this.connecting = false; }
  }
  async ensureWorker(sessionId) {
    const epoch = ++this.ensureEpoch;
    for (let attempt = 0; attempt < 20 && this.room && !this.workerReady && epoch === this.ensureEpoch; attempt++) {
      try {
        await fetch("/api/livekit/ensure-agent", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }) });
        if (this.room && epoch === this.ensureEpoch) await this.send("ui.sync");
      } catch (_) { /* A local service restart is transient; keep retrying. */ }
      if (this.workerReady) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  async mute() {
    if (!this.room) return;
    this.muted = !this.muted;
    await this.room.localParticipant.setMicrophoneEnabled(!this.muted);
    this.onStatus(this.muted ? "麦克风已静音" : "持续聆听中，可直接说话");
    return this.muted;
  }
  async resumeAudio() { if (this.room) await this.room.startAudio(); }
  cleanup() {
    this.ensureEpoch += 1;
    this.workerReady = false;
    clearTimeout(this.readyTimer);
    this.microphone?.stop();
    this.microphone = null;
    this.audio.forEach(el => { el.pause(); el.remove(); });
    this.audio.clear(); this.room = null; this.muted = false;
    this.onConnection(false);
    this.onStatus("语音已结束，麦克风已释放");
  }
  async disconnect() { if (this.room) await this.room.disconnect(); this.cleanup(); }
}
