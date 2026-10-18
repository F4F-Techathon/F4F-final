// Microphone capture for the multi-agent backend: 16 kHz mono s16le in frames of 320 samples (20 ms).
// The AudioContext runs at 16 kHz where the browser allows it; otherwise windows of input are averaged down to
// 16 kHz, keeping the fractional phase across render quanta. Adapted from the backend's reference capture
// processor (Backend/eat-what-backend/web/console-audio-worklet.js).
class MicCapture extends AudioWorkletProcessor {
  constructor() { super(); this.phase = 0; this.sum = 0; this.count = 0; this.batch = []; this.energy = 0 }
  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true
    for (const sample of input) {
      this.sum += sample; this.count++; this.phase += 16000
      if (this.phase < sampleRate) continue
      this.phase -= sampleRate
      const value = this.sum / this.count
      this.sum = 0; this.count = 0
      this.batch.push(Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)))
      this.energy += value * value
      if (this.batch.length === 320) {
        const pcm = new Int16Array(this.batch)
        this.port.postMessage({ pcm: pcm.buffer, level: Math.sqrt(this.energy / 320) }, [pcm.buffer])
        this.batch = []; this.energy = 0
      }
    }
    return true
  }
}
registerProcessor('mic-capture', MicCapture)
