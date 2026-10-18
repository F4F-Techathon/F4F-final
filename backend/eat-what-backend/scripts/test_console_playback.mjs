import assert from 'node:assert/strict';
import {playedSamples} from '../web/console-playback.js';
const frames=[{start:10,count:480,offset:0,rate:24000},{start:10.02,count:480,offset:480,rate:24000},{start:11,count:480,offset:960,rate:24000}];
assert.equal(playedSamples(frames,9),0);
assert.equal(playedSamples(frames,10),0);
assert.ok(Math.abs(playedSamples(frames,10.01)-240)<=1);
assert.equal(playedSamples(frames,10.5),960); // Received but scheduled future audio is not heard.
assert.ok(Math.abs(playedSamples(frames,11.01)-1200)<=1);
assert.equal(playedSamples(frames,12),1440);
console.log('PASS: output-clock playback samples exclude queued/future audio and account for gaps.');
