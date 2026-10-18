/** AudioContext timeline -> actually reached sample watermark, never received bytes. */
export function playedSamples(frames, outputTime){
  let played=0;
  for(const frame of frames){
    if(outputTime<=frame.start)break;
    const count=Math.min(frame.count,Math.max(0,Math.floor((outputTime-frame.start)*frame.rate)));
    played=Math.max(played,frame.offset+count);
    if(count<frame.count)break;
  }
  return played;
}
