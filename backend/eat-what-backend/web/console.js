import {renderGraph} from './console-graph.js';
import {playedSamples} from './console-playback.js';
const $ = s => document.querySelector(s);
const state = {ws:null, connected:false, catalog:[], snapshot:null, personas:new Map(), characters:new Map(), context:null, latest:null,
  events:[], tab:'workflow', turns:new Map(), epoch:0, audioFrames:0, micFrames:0, mic:null, micLoading:false,
  runs:new Map(), selectedRun:null, selectedEvent:null,
  playbacks:new Map(),
  audio:null, sources:new Set(), audioCursor:0, rate:24000, activeTurn:null, sampleCounts:new Map(), latency:{}};
const encoder = new TextEncoder(), decoder = new TextDecoder();
$('#endpoint').value = `${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/realtime`;
function banner(text,error=false){$('#banner').textContent=text;$('#banner').classList.toggle('error',error)}
function pipeline(stage){const stages=Array.isArray(stage)?stage:[stage];document.querySelectorAll('[data-stage]').forEach(el=>el.classList.toggle('active',stages.includes(el.dataset.stage)))}
function selected(){return [...document.querySelectorAll('.restaurant input:checked')].map(el=>el.value)}
function updateSelection(){ $('#selection-count').textContent=`${selected().length} 家`; $('#ids').value=selected().join('\n');renderActivity() }
function send(type,data={},quiet=false){
  if(state.ws?.readyState!==WebSocket.OPEN){banner('请先建立调试会话',true);return false}
  const body={sessionId:$('#session-id').textContent,commandId:crypto.randomUUID(),type,data};
  state.ws.send(JSON.stringify(body)); if(!quiet)log({...body,at:Date.now()/1000,direction:'outbound'});return true;
}
function log(event){
  state.events.push(event);if(state.events.length>1500)state.events.shift(); state.latest=event;
  const filter=$('#event-filter').value;
  if(matchesFilter(event,filter))addLog(event);
  if(state.tab==='event'&&!state.selectedEvent)inspect();
}
function matchesFilter(event,filter){return filter==='all'||filter==='trace'&&['trace','workflow'].includes(event.type)&&!['audio.input','audio.output'].includes(event.data?.stage)||event.type===filter&&filter!=='trace'||filter==='audio'&&['audio.input','audio.output'].includes(event.data?.stage)}
function addLog(event){
  const list=$('#events');list.querySelector('p')?.remove();const row=document.createElement('div');row.className=`event-row ${event.type} ${event.direction||''}`;
  const time=document.createElement('time');time.textContent=new Date((event.at||Date.now()/1000)*1000).toLocaleTimeString('zh-CN',{hour12:false});
  const type=document.createElement('span');type.className='event-type';type.textContent=event.direction?`↑ ${event.type}`:(event.data?.stage||event.type);
  const summary=document.createElement('span');summary.className='event-summary';const d=event.data||{};
  summary.textContent=d.text||d.reason||d.message||d.phase||d.restaurantId||JSON.stringify(d);
  row.append(time,type,summary);row.onclick=()=>{state.selectedEvent=event;setTab('event')};list.append(row);
  while(list.children.length>600)list.firstElementChild.remove();if($('#follow').checked)list.scrollTop=list.scrollHeight;
}
function inspect(){
  $('#persona-picker').hidden=state.tab!=='persona';
  $('#workflow-follow').hidden=state.tab!=='workflow';
  $('#workflow-follow').textContent=state.selectedRun?'取消固定，跟随最新步骤':'正在跟随最新步骤';
  const value=state.tab==='workflow'?state.runs.get(state.selectedRun||[...state.runs.keys()].at(-1)):state.tab==='state'?state.snapshot:state.tab==='context'?state.context:state.tab==='persona'?state.personas.get($('#persona-picker').value):state.selectedEvent||state.latest;
  $('#inspect-content').textContent=JSON.stringify(value??{note:'尚未产生该类事件'},null,2);
}
const phaseNames={running:'处理中',streaming:'输出流接收中',completed:'完成',cancelled:'已打断',discarded:'已废弃',error:'失败',waiting:'等待播放'};
const actorNames={coordinator:'调度器 LLM',tts:'语音合成',verifier:'证据检查',playback:'前端播放',input:'输入解析',stt:'语音转写'};
const speechActNames={present:'自荐',attack:'攻击',respond:'回应',compare:'对比',answer:'回答用户',clarify:'澄清 / 追问'};
function actorName(actor){return actorNames[actor]||state.characters.get(actor)?.characterName||state.personas.get(actor)?.characterName||state.catalog.find(s=>s.id===actor)?.name||actor}
function renderActivity(){
  const box=$('#agent-activity');box.replaceChildren();
  const actors=['coordinator',...(state.snapshot?.restaurantIds||[...state.personas.keys()]),'input','stt','verifier','tts','playback'];
  const runs=[...state.runs.values()];
  for(const actor of actors){
    const run=runs.filter(r=>r.actor===actor).at(-1);const active=run&&['running','streaming','waiting'].includes(run.status);
    const item=document.createElement('span');item.className=`activity-chip${active?' busy':''}${run?.status==='error'?' failed':''}`;
    item.textContent=`${actorName(actor)} · ${active?phaseNames[run.status]:run?phaseNames[run.status]:'待命'}`;box.append(item);
  }
  const active=runs.filter(r=>['running','streaming','waiting'].includes(r.status));
  $('#workflow-status').textContent=active.length?active.map(r=>`${actorName(r.actor)}：${phaseNames[r.status]}`).join(' / '):'当前无执行中的步骤';
  pipeline(active.map(r=>r.stage==='playback'?'tts':r.stage));
  renderGraph($('#node-graph'),{ids:state.snapshot?.restaurantIds||selected(),shops:state.catalog,personas:state.personas,runs,mic:state.mic,
    onSelect:actor=>{const run=[...state.runs.values()].filter(r=>r.actor===actor).at(-1);if(run){state.selectedRun=run.runId;setTab('workflow')}else if(actor==='data'){setTab('persona')}else if(['list','session'].includes(actor)){setTab('state')}else{state.selectedEvent={type:'node.idle',data:{actor,status:'待命',note:'该节点尚未收到执行事件'}};setTab('event')}}});
}
function onWorkflow(d){
  let run=state.runs.get(d.runId);
  if(!run){run={runId:d.runId,startedAt:new Date().toISOString(),rawOutput:''};state.runs.set(d.runId,run)}
  const {delta,...fields}=d;Object.assign(run,fields);if(delta)run.rawOutput=(run.rawOutput+delta).slice(-16000);
  run.updatedAt=new Date().toISOString();
  while(state.runs.size>40){const id=state.runs.keys().next().value;state.runs.delete(id);if(state.selectedRun===id)state.selectedRun=null;$('#workflow-runs').querySelector(`[data-run="${id}"]`)?.remove()}
  const list=$('#workflow-runs');list.querySelector('p')?.remove();
  let card=list.querySelector(`[data-run="${d.runId}"]`);
  if(!card){card=document.createElement('button');card.className='workflow-card';card.dataset.run=d.runId;card.append(document.createElement('b'),document.createElement('small'),document.createElement('pre'));card.onclick=()=>{state.selectedRun=d.runId;setTab('workflow')};list.append(card)}
  card.dataset.status=run.status;card.children[0].textContent=`${actorName(run.actor)} · ${phaseNames[run.status]||run.status}`;
  card.children[1].textContent=`${run.stage} · ${run.detail||''}`;
  card.children[2].textContent=run.rawOutput||JSON.stringify(run.output||run.input||{},null,2);
  if(!state.selectedRun)list.scrollTop=list.scrollHeight;
  renderActivity();
  if(state.tab==='workflow')inspect();
}
function setTab(tab){state.tab=tab;document.querySelectorAll('[data-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);el.setAttribute('aria-selected',String(el.dataset.tab===tab))});inspect()}
function clearAudio(){
  for(const playback of state.playbacks.values())if(!playback.finalized)reportPlayback(playback,'interrupted');
  for(const source of state.sources){source.onended=null;try{source.stop()}catch{}}
  state.sources.clear();state.audioCursor=state.audio?.currentTime||0;
}
function outputClock(){
  if(!state.audio)return 0;
  const stamp=state.audio.getOutputTimestamp?.();
  return stamp&&Number.isFinite(stamp.contextTime)?stamp.contextTime:Math.max(0,state.audio.currentTime-(state.audio.baseLatency||0)-(state.audio.outputLatency||0));
}
function reportPlayback(playback,status='progress'){
  if(playback.finalized)return 0;
  const count=playedSamples(playback.frames,outputClock());playback.played=Math.max(playback.played||0,count);
  if(status==='ended'&&playback.played<(state.sampleCounts.get(playback.turnId)||0))return false;
  if(state.ws?.readyState===WebSocket.OPEN)send('playback',{turnId:playback.turnId,epoch:playback.epoch,status,playedSamples:playback.played},status==='progress');
  onWorkflow({runId:playback.turnId+'-play',actor:'playback',stage:'playback',status:status==='progress'?'running':status==='ended'?'completed':'cancelled',detail:`输出时钟确认播放 ${playback.played} 样本`,output:{playedSamples:playback.played},origin:'browser'});
  if(status!=='progress'){playback.finalized=true;const t=state.turns.get(playback.turnId);if(t)t.label.textContent=`${playback.turnId} · ${status==='ended'?'播放完成':'已打断 · 全文含未播放内容'}`}
  return true;
}
setInterval(()=>{if(state.ws?.readyState===WebSocket.OPEN)for(const p of state.playbacks.values())if(!p.finalized)reportPlayback(p)},100);
async function audioContext(){
  if(!state.audio)state.audio=new AudioContext();
  if(state.audio.state==='suspended')await state.audio.resume();return state.audio;
}
function binary(raw){
  const view=new DataView(raw);if(raw.byteLength<4)return;const n=view.getUint32(0,true);if(n>2048||4+n>=raw.byteLength)return;
  const header=JSON.parse(decoder.decode(new Uint8Array(raw,4,n)));if(header.epoch!==state.epoch||state.turns.get(header.turnId)?.cancelled)return;
  const pcm=new DataView(raw,4+n);const count=pcm.byteLength/2;
  const firstChunk=!state.sampleCounts.has(header.turnId);
  state.audioFrames++;state.sampleCounts.set(header.turnId,(state.sampleCounts.get(header.turnId)||0)+count);updateAudioStats();
  if(!state.audio||state.audio.state==='closed')return;
  const buffer=state.audio.createBuffer(1,count,state.rate);const channel=buffer.getChannelData(0);for(let i=0;i<count;i++)channel[i]=pcm.getInt16(i*2,true)/32768;
  const source=state.audio.createBufferSource();source.buffer=buffer;source.connect(state.audio.destination);
  const start=Math.max(state.audio.currentTime+.065,state.audioCursor);state.audioCursor=start+buffer.duration;
  let playback=state.playbacks.get(header.turnId);if(!playback){playback={turnId:header.turnId,epoch:header.epoch,frames:[],played:0,finalized:false};state.playbacks.set(header.turnId,playback)}
  playback.frames.push({start,count,offset:header.sampleOffset,rate:state.rate});
  while(state.playbacks.size>40)state.playbacks.delete(state.playbacks.keys().next().value);
  state.sources.add(source);source.onended=()=>state.sources.delete(source);source.start(start);
  if(firstChunk){const local={runId:header.turnId+'-play',actor:'playback',stage:'playback',status:'running',detail:'浏览器已将实际PCM加入播放队列',origin:'browser',input:{turnId:header.turnId}};log({type:'workflow',epoch:header.epoch,at:Date.now()/1000,data:local});onWorkflow(local)}
}
function updateAudioStats(){$('#audio-stats').textContent=`${state.micFrames} ↑ / ${state.audioFrames} ↓`}
function utterance(turn){
  if(state.turns.has(turn.turnId))return state.turns.get(turn.turnId);
  $('#conversation .empty')?.remove();const el=document.createElement('article');el.className='utterance';
  const head=document.createElement('div');head.className='utterance-head';const name=document.createElement('b');name.textContent=turn.restaurantName?`${turn.speaker} · ${turn.restaurantName}`:turn.speaker||turn.restaurantId;
  const label=document.createElement('span');label.textContent=`${turn.turnId} · ${turn.topic||''}`;head.append(name,label);
  const meta=document.createElement('div');meta.className='utterance-meta';
  const behavior=document.createElement('span');behavior.className='speech-act';behavior.dataset.act=turn.speechAct||'';behavior.textContent=`调度行为：${speechActNames[turn.speechAct]||turn.speechAct||'未提供'}`;
  meta.append(behavior);if(turn.targetRestaurantId){const target=document.createElement('span');target.textContent=`对象：${actorName(turn.targetRestaurantId)}`;meta.append(target)}
  if(turn.discussionDimension){const dimension=document.createElement('span');dimension.textContent=`维度：${turn.discussionDimension}`;meta.append(dimension)}
  const task=document.createElement('details');task.className='utterance-task';const taskTitle=document.createElement('summary');taskTitle.textContent='查看调度分配（不含台词指导）';const taskBody=document.createElement('p');taskBody.textContent=JSON.stringify({speechAct:turn.speechAct,targetRestaurantId:turn.targetRestaurantId,replyTo:turn.replyTo||[],evidenceIds:turn.evidenceIds||[],discussionDimension:turn.discussionDimension},null,2);task.append(taskTitle,taskBody);
  const p=document.createElement('p');p.textContent='正在准备台词…';const evidence=document.createElement('div');el.append(head,meta,p,evidence,task);$('#conversation').append(el);
  const item={el,p,evidence,text:'',label,cancelled:false,epoch:state.epoch};state.turns.set(turn.turnId,item);$('#conversation').scrollTop=$('#conversation').scrollHeight;return item;
}
function userLine(text){$('#conversation .empty')?.remove();const el=document.createElement('article');el.className='utterance user';const head=document.createElement('b');head.textContent='用户';const p=document.createElement('p');p.textContent=text;el.append(head,p);$('#conversation').append(el);$('#conversation').scrollTop=$('#conversation').scrollHeight}
async function finishPlayback(turnId,epoch,hasAudio){
  const remaining=hasAudio?Math.max(0,(state.audioCursor-(state.audio?.currentTime||0))*1000):100;
  const finish=()=>{if(!state.connected||epoch!==state.epoch||state.turns.get(turnId)?.cancelled)return;if(!hasAudio){send('playback',{turnId,epoch,status:'ended',playedSamples:0});const t=state.turns.get(turnId);if(t)t.label.textContent=`${turnId} · 文本已完成`;return}const playback=state.playbacks.get(turnId);if(playback&&!reportPlayback(playback,'ended'))setTimeout(finish,40)};
  setTimeout(finish,remaining+70);
}
function onEvent(event){
  if(event.epoch<state.epoch)return;
  if(event.epoch>state.epoch){clearAudio();state.epoch=event.epoch}
  $('#epoch').textContent=`EPOCH ${state.epoch}`;$('#session-id').textContent=event.sessionId;
  const d=event.data||{};log(event);
  if(event.type==='state'){
    state.snapshot=d;$('#engine').textContent=d.engine==='rules'?'规则降级':d.engine||'—';
    if(d.ttsProvider)$('#tts-provider').textContent=d.ttsProvider;
    renderActivity();
    $('#run-state').textContent=d.userSpeaking?'用户说话中':d.status==='running'?'正在讨论':d.status==='ready'?'连接就绪':'已暂停';
    if(d.micReady&&state.mic){state.mic.ready=true;$('#mic-status').textContent='持续上传 · 后端识别';$('#mic').disabled=false;banner('麦克风已打开；语音检测与转写在后端完成')}
    if(state.tab==='state')inspect();
  }else if(event.type==='restaurants.updated'){
    state.characters=new Map((d.restaurants||[]).map(r=>[r.restaurantId,r]));
    $('#persona-version').textContent=[...new Set((d.restaurants||[]).map(r=>r.personaVersion?.split(':').at(-1)).filter(Boolean))].join(' / ')||'—';
    $('#room-roster-title').textContent=`服务端角色名单 · ${state.characters.size} 家`;
    const list=$('#room-characters');list.replaceChildren();
    for(const r of state.characters.values()){const row=document.createElement('button');row.className='room-character';row.textContent=`${r.characterName} · ${r.restaurantName}`;row.title=r.restaurantId;row.onclick=()=>{state.selectedEvent=event;setTab('event')};list.append(row)}
    if(!state.characters.size)list.textContent='当前没有餐厅';
    renderActivity();
  }else if(event.type==='turn'){
    if(d.phase==='start'){state.activeTurn=d.turnId;utterance(d);$('#speaker').textContent=d.speaker;pipeline('generate')}
    if(d.phase==='cancel'){clearAudio();const t=state.turns.get(d.turnId);if(t){t.cancelled=true;t.el.classList.add('cancelled');t.label.textContent=`${d.turnId} · 已打断${t.text?' · 全文含未播放内容':''}`;if(!t.text)t.p.textContent='本轮已打断，未产生完整台词。'}banner(`已打断：${d.reason}`);$('#speaker').textContent='已停止';}
    if(d.phase==='generated'){const t=state.turns.get(d.turnId);if(t&&!t.cancelled)t.label.textContent=`${d.turnId} · ${d.audio?'音频已发送 · 播放中':'文本已完成'}`;finishPlayback(d.turnId,event.epoch,d.audio)}
  }else if(event.type==='speech.ready'){
    const t=state.turns.get(d.turnId);if(!t||t.cancelled)return;
    t.text=d.text;t.p.textContent=d.text;t.label.textContent=`${d.turnId} · 文本已生成${d.audioEnabled?' · 音频输出中':' · 文本模式'}`;
    t.evidence.replaceChildren();for(const ref of d.evidence||[]){const b=document.createElement('button');b.className='evidence-button';b.textContent=`${ref.sourceFile} · 记录${ref.sourceRow}`;b.onclick=()=>{state.selectedEvent={type:'evidence',data:ref};setTab('event')};t.evidence.append(b)}
    $('#conversation').scrollTop=$('#conversation').scrollHeight;
  }else if(event.type==='text'){
    const t=state.turns.get(d.turnId);if(!t||t.cancelled)return;
    if(d.phase==='done'){t.text=d.text;t.p.textContent=d.text;t.evidence.replaceChildren();for(const ref of d.evidence||[]){const b=document.createElement('button');b.className='evidence-button';b.textContent=`${ref.sourceFile} · 记录${ref.sourceRow}`;b.onclick=()=>{state.selectedEvent={type:'evidence',data:ref};setTab('event')};t.evidence.append(b)}
      const inspectFinal=document.createElement('button');inspectFinal.className='evidence-button';inspectFinal.textContent='查看完整结构化结果';inspectFinal.onclick=()=>{state.selectedEvent=event;setTab('event')};t.evidence.append(inspectFinal)}
    $('#conversation').scrollTop=$('#conversation').scrollHeight;
  }else if(event.type==='audio'){
    if(d.phase==='start'){state.rate=d.sampleRate;pipeline('tts')}
  }else if(event.type==='transcript'){
    userLine(d.text);banner(`后端转写：${d.text||'未识别到文字'}`);pipeline('input');
  }else if(event.type==='error'){
    renderActivity();
    banner(`${d.code}：${d.message}`,true);
    if(d.validation){state.selectedEvent=event;setTab('event')}
    if(d.code==='MIC_PIPELINE_FAILED')stopMic();
  }else if(event.type==='result'){
    const name=state.catalog.find(s=>s.id===d.restaurantId)?.name;userLine(`推荐结果：${name||'暂无满足条件的餐厅'}\n${[...(d.reasons||[]),...(d.cautions||[])].join('\n')}`)
  }else if(event.type==='workflow'){
    if(d.stage==='prefetch'&&d.status==='completed'&&d.output?.turnId){const parent=state.runs.get(d.runId)?.input?.afterTurnId;for(const run of state.runs.values())if(run.speculative&&run.prefetchSourceTurnId===parent)run.adopted=true}
    onWorkflow({...d,epoch:event.epoch});
  }else if(event.type==='trace'){
    if(d.stage==='interrupt')for(const run of [...state.runs.values()])if(run.speculative&&!run.adopted&&run.epoch<event.epoch)onWorkflow({runId:run.runId,actor:run.actor,stage:run.stage,status:'discarded',detail:'会话版本已变更，预生成已废弃，未进入正式历史'});
    if(d.stage==='persona.ready'){state.personas.set(d.persona.restaurantId,d.persona);const select=$('#persona-picker');if(![...select.options].some(o=>o.value===d.persona.restaurantId)){const option=document.createElement('option');option.value=d.persona.restaurantId;option.textContent=state.catalog.find(s=>s.id===option.value)?.name||option.value;select.append(option)}renderActivity();pipeline('data');if(state.tab==='persona')inspect()}
    if(d.stage==='agent.context'){state.context=d;if(state.tab==='context')inspect()}
    if(d.stage==='coordinator.plan')pipeline('plan');
    if(d.stage==='vad.start'){clearAudio();pipeline('input')}
    if(d.stage==='stt.loading')banner('正在加载后端 VAD / STT，首次需要等待；尚未上传麦克风音频');
    if(d.stage==='latency.text')state.latency.text=d.firstTextMs;
    if(d.stage==='latency.audio')state.latency.audio=d.firstAudioMs;
    $('#latency').textContent=`${state.latency.text??'—'} / ${state.latency.audio??'—'} ms`;
  }
}
function connected(value){
  state.connected=value;$('#connection').textContent=value?'WebSocket 已连接':'未连接';$('#connection').classList.toggle('online',value);
  $('#connect').textContent=value?'断开会话':'建立调试会话';document.querySelectorAll('[data-action],#update-roster,#mic,#send').forEach(el=>el.disabled=!value);
  if(!value){for(const run of [...state.runs.values()])if(['running','streaming','waiting'].includes(run.status))onWorkflow({runId:run.runId,actor:run.actor,stage:run.stage,status:'cancelled',detail:'连接已关闭'});renderActivity();if(state.tab==='workflow')inspect()}
}
async function connect(){
  if(state.ws){await disconnect();return}
  if(!selected().length){banner('请至少选择一家餐厅',true);return}
  await audioContext();const url=new URL($('#endpoint').value);if(!['ws:','wss:'].includes(url.protocol)){banner('需要 ws:// 或 wss:// 地址',true);return}
  state.playbacks.clear();state.characters.clear();$('#room-roster-title').textContent='服务端角色名单';$('#room-characters').textContent='等待服务端取名完成…';const ws=new WebSocket(url);state.ws=ws;ws.binaryType='arraybuffer';$('#connect').disabled=true;
  ws.onopen=()=>{state.epoch=0;state.context=null;state.snapshot=null;state.activeTurn=null;state.latency={};state.audioFrames=0;state.micFrames=0;state.selectedRun=null;state.selectedEvent=null;state.runs.clear();$('#workflow-runs').replaceChildren();state.sampleCounts.clear();state.turns.clear();state.personas.clear();$('#speaker').textContent='等待发言';$('#latency').textContent='— / —';updateAudioStats();$('#persona-picker').replaceChildren();$('#conversation').replaceChildren();connected(true);$('#connect').disabled=false;send('session.start',{restaurantIds:selected(),audioEnabled:$('#tts-enabled').checked,preferences:{userNotes:[$('#preference-input').value.trim()].filter(Boolean)}});banner('会话已建立，点击「只跑一轮」或「开始 / 继续」')};
  ws.onmessage=e=>{try{if(e.data instanceof ArrayBuffer)binary(e.data);else onEvent(JSON.parse(e.data))}catch(error){banner(error.message,true)}};
  ws.onerror=()=>banner('实时连接失败，请确认服务地址和后端日志',true);
  ws.onclose=()=>{state.ws=null;connected(false);$('#connect').disabled=false;clearAudio();stopMic();banner('连接已关闭；后端会停止这次调试会话')};
}
async function disconnect(){await stopMic();const ws=state.ws;state.ws=null;clearAudio();ws?.close();connected(false)}
async function startMic(){
  if(state.mic||state.micLoading)return;state.micLoading=true;$('#mic').disabled=true;
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(!state.connected){stream.getTracks().forEach(t=>t.stop());return}
    const ctx=new AudioContext({sampleRate:16000});await ctx.audioWorklet.addModule('/assets/console-audio-worklet.js');await ctx.resume();
    const source=ctx.createMediaStreamSource(stream),node=new AudioWorkletNode(ctx,'console-capture'),gain=ctx.createGain();gain.gain.value=0;
    source.connect(node);node.connect(gain);gain.connect(ctx.destination);
    const mic={stream,ctx,node,ready:false,id:crypto.randomUUID(),seq:0};state.mic=mic;
    node.port.onmessage=({data})=>{
      $('#mic-level').style.width=`${Math.min(100,data.level*500)}%`;
      if(!mic.ready||state.ws?.readyState!==WebSocket.OPEN)return;
      if(state.ws.bufferedAmount>64000){banner('麦克风上传积压，已停止采集；请检查网络',true);stopMic();return}
      const head=encoder.encode(JSON.stringify({kind:'mic',streamId:mic.id,chunkSeq:mic.seq,sampleOffset:mic.seq*320}));
      const frame=new Uint8Array(4+head.length+data.pcm.byteLength);new DataView(frame.buffer).setUint32(0,head.length,true);frame.set(head,4);frame.set(new Uint8Array(data.pcm),4+head.length);state.ws.send(frame);mic.seq++;state.micFrames++;updateAudioStats();
    };
    send('mic.start',{streamId:mic.id});$('#mic').textContent='关闭麦克风';$('#mic').classList.add('recording');$('#mic-status').textContent='正在等待后端就绪';
  }catch(error){stream?.getTracks().forEach(t=>t.stop());banner(`麦克风启动失败：${error.message}`,true)}
  finally{state.micLoading=false;$('#mic').disabled=!state.connected}
}
async function stopMic(){
  const mic=state.mic;state.mic=null;
  if(mic){mic.ready=false;mic.node.port.onmessage=null;mic.stream.getTracks().forEach(t=>t.stop());mic.node.disconnect();await mic.ctx.close();if(state.ws?.readyState===WebSocket.OPEN)send('mic.stop')}
  $('#mic').textContent='打开麦克风';$('#mic').classList.remove('recording');$('#mic-status').textContent='麦克风关闭';$('#mic-level').style.width='0';
}
$('#connect').onclick=()=>connect().catch(e=>banner(e.message,true));
$('#mic').onclick=()=>state.mic?stopMic():startMic();
$('#update-roster').onclick=()=>{if(!selected().length){banner('至少保留一家；也可以通过文字明确移除全部',true);return}send('restaurants.update',{restaurantIds:selected()})};
$('#tts-enabled').onchange=()=>{if(state.connected)send('control',{action:'audio',enabled:$('#tts-enabled').checked})};
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{if(['pause','interrupt','reset'].includes(button.dataset.action))clearAudio();if(button.dataset.action==='reset'){state.turns.clear();$('#conversation').replaceChildren()}send('control',{action:button.dataset.action})});
$('#text-form').onsubmit=e=>{e.preventDefault();const input=$('#text-input');if(!input.value.trim())return;clearAudio();userLine(input.value);send('user.text',{text:input.value});input.value=''};
document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>setTab(el.dataset.tab));$('#persona-picker').onchange=inspect;
$('#workflow-follow').onclick=()=>{state.selectedRun=null;inspect()};
$('#apply-ids').onclick=()=>{const ids=$('#ids').value.split(/[\s,，]+/).filter(Boolean);const unknown=ids.filter(id=>!state.catalog.some(s=>s.id===id));if(unknown.length){banner(`无法在当前本地测试资料找到：${unknown.join(', ')}`,true);return}document.querySelectorAll('.restaurant input').forEach(el=>el.checked=ids.includes(el.value));updateSelection()};
$('#clear-log').onclick=()=>{$('#events').replaceChildren()};
$('#event-filter').onchange=()=>{$('#events').replaceChildren();for(const e of state.events)if(matchesFilter(e,$('#event-filter').value))addLog(e)};
$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([state.events.map(e=>JSON.stringify(e)).join('\n')],{type:'application/x-ndjson'}));const a=document.createElement('a');a.href=url;a.download=`agent-console-${Date.now()}.ndjson`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('pagehide',()=>{state.mic?.stream.getTracks().forEach(t=>t.stop());state.ws?.close();clearAudio()});
async function init(){
  const response=await fetch('/api/debug/catalog');if(!response.ok)throw new Error(`读取资料失败：HTTP ${response.status}`);const data=await response.json();
  state.catalog=data.restaurants;$('#data-version').textContent=data.version;$('#restaurants').replaceChildren();
  for(const [index,shop] of data.restaurants.entries()){
    const label=document.createElement('label');label.className='restaurant';const check=document.createElement('input');check.type='checkbox';check.value=shop.id;check.checked=index<3;check.onchange=updateSelection;
    const info=document.createElement('div');const name=document.createElement('b');name.textContent=shop.name;const meta=document.createElement('small');meta.textContent=`${shop.category} · 参考人均 ¥${shop.avgPrice}`;const id=document.createElement('code');id.textContent=shop.id;info.append(name,meta,id);label.append(check,info);$('#restaurants').append(label);
  }
  updateSelection();$('#engine').textContent=data.llmConfigured?'待连接':'规则降级';
}
init().catch(e=>banner(e.message,true));
