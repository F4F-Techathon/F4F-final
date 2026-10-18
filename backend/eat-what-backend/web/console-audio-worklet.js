class ConsoleCapture extends AudioWorkletProcessor {
  constructor() { super(); this.phase = 0; this.sum = 0; this.count = 0; this.batch = []; this.energy = 0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    // Streaming window averaging; retain phase across render quanta.
    for (const sample of input) {
      this.sum += sample; this.count++; this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const value = this.sum / this.count; this.sum = 0; this.count = 0;
      this.batch.push(Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)));
      this.energy += value * value;
      if (this.batch.length === 320) {
        const data = new Int16Array(this.batch);
        this.port.postMessage({ pcm: data.buffer, level: Math.sqrt(this.energy / 320) }, [data.buffer]);
        this.batch = []; this.energy = 0;
      }
    }
    return true;
  }
}
registerProcessor('console-capture', ConsoleCapture);
