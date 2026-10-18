import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code = fs.readFileSync(new URL('../web/console-audio-worklet.js', import.meta.url), 'utf8');
for (const rate of [16000, 48000]) {
  let Processor; const frames = [];
  const context = {sampleRate:rate, AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>frames.push(data)}}},
    registerProcessor:(_, cls)=>{Processor=cls}, Int16Array, Math};
  vm.runInNewContext(code, context);
  const processor = new Processor();
  for(let start=0; start<rate; start+=128){
    const input=new Float32Array(128);
    for(let i=0;i<128;i++)input[i]=Math.sin((start+i)*2*Math.PI*440/rate)*.3;
    processor.process([[input]]);
  }
  assert.equal(frames.length,50,`${rate}Hz -> fifty 20ms frames`);
  for(const f of frames){assert.equal(f.pcm.byteLength,640);assert.ok(Number.isFinite(f.level)&&f.level>0&&f.level<1)}
  assert.ok(frames.some(f=>new Int16Array(f.pcm).some(x=>x<0)));
}
console.log('PASS: actual capture processor resamples 16/48kHz into finite, continuous 16kHz PCM frames.');
