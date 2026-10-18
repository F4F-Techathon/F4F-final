// The microphone for the multi-agent backend's speech recognition: 16 kHz mono s16le, 20 ms frames.
// It runs only while the talk button is held; the backend's voice activity detection and Whisper do the rest.

export interface MicCapture {
  /** Asks for the microphone (call from the user's gesture) and starts delivering frames. */
  start(): Promise<void>
  stop(): void
  readonly running: boolean
}

export function createMicCapture(onFrame: (pcm: Int16Array, level: number) => void): MicCapture {
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let node: AudioWorkletNode | null = null
  let generation = 0

  function stop() {
    generation++
    if (node) { node.port.onmessage = null; node.disconnect() }
    stream?.getTracks().forEach((track) => track.stop())
    void ctx?.close().catch(() => undefined)
    node = null; stream = null; ctx = null
  }

  async function start() {
    stop()
    const mine = ++generation
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
    if (mine !== generation) { media.getTracks().forEach((track) => track.stop()); return }
    stream = media
    // 16 kHz where supported; the worklet resamples from whatever the device gives otherwise.
    try { ctx = new AudioContext({ sampleRate: 16000 }) } catch { ctx = new AudioContext() }
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/mic-capture.js`)
    if (mine !== generation) return
    await ctx.resume()
    const source = ctx.createMediaStreamSource(media)
    node = new AudioWorkletNode(ctx, 'mic-capture')
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)
    node.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      if (mine === generation) onFrame(new Int16Array(data.pcm), data.level)
    }
  }

  return { start, stop, get running() { return !!node } }
}
