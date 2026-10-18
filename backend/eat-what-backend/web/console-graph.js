const NS='http://www.w3.org/2000/svg';
const labels={running:'处理中',streaming:'接收输出流',completed:'完成',waiting:'等待播放回执',cancelled:'已打断',discarded:'已废弃',error:'检查 / 执行失败',idle:'待命',ready:'资料就绪'};
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node}
function short(text,max=21){const chars=Array.from(text||'');return chars.length>max?chars.slice(0,max).join('')+'…':text||''}

export function renderGraph(root,{ids,shops,personas,runs,mic,onSelect}){
  const signature=ids.map(id=>id+':'+(personas.get(id)?.characterName||'')).join(',');
  const rows=Math.max(1,Math.ceil(ids.length/3)),bottom=304+rows*106,height=bottom+110;
  const nodes=[
    {id:'list',actor:'list',title:'前端餐厅列表',sub:'restaurantIds',x:20,y:25},
    {id:'data',actor:'data',title:'资料读取 / 人格构建',sub:'CSV → 角色与证据',x:260,y:25},
    {id:'session',actor:'session',title:'共享会话状态',sub:'名单 · 偏好 · 已播放历史',x:500,y:25},
    {id:'mic',actor:'mic',title:'麦克风 / 文字输入',sub:'PCM 或 user.text',x:20,y:145},
    {id:'stt',actor:'stt',title:'VAD / STT',sub:'检测开口 · 句末转写',x:260,y:145},
    {id:'coordinator',actor:'coordinator',title:'调度器 LLM',sub:'选谁说 · 行为 · 读哪些资料',x:500,y:145},
    ...ids.map((id,i)=>({id,actor:id,title:personas.get(id)?.characterName||shops.find(s=>s.id===id)?.name||id,sub:short(shops.find(s=>s.id===id)?.name||'餐厅 Agent · LLM',15),x:20+(i%3)*240,y:275+Math.floor(i/3)*106})),
    {id:'verifier',actor:'verifier',title:'证据检查',sub:'引用ID · 数字 · 修正一次',x:20,y:bottom},
    {id:'tts',actor:'tts',title:'TTS 音频流',sub:'短句 → PCM → 前端',x:260,y:bottom},
    {id:'playback',actor:'playback',title:'前端播放 / 回执',sub:'播放时预生成 · 完成后交付',x:500,y:bottom}
  ];
  const busy=run=>run&&['running','streaming','waiting'].includes(run.status);
  const latest=new Map();for(const run of runs)latest.set(run.actor,run);for(const run of runs)if(busy(run))latest.set(run.actor,run);
  if(root.dataset.signature!==signature||!root.firstChild){
    root.dataset.signature=signature;root.replaceChildren();
    const svg=el('svg',{viewBox:`0 0 750 ${height}`,class:'workflow-svg',role:'group','aria-label':'Multi-Agent 实时节点图'});
    const defs=el('defs');for(const [id,color] of [['normal','var(--graph-line)'],['active','var(--accent)']]){const marker=el('marker',{id:`wf-arrow-${id}`,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(el('path',{d:'M0 0 L10 5 L0 10 Z',fill:color}));defs.append(marker)}svg.append(defs);
    const edges=el('g',{class:'graph-edges'});
    function edge(id,d,from,to,label,x,y,extra=''){edges.append(el('path',{d,class:`graph-edge ${extra}`,'data-edge':id,'data-from':from,'data-to':to,'marker-end':'url(#wf-arrow-normal)'}));if(label)edges.append(el('text',{x,y,class:'edge-label'},label))}
    edge('list-data','M220 67 H260','list','data');edge('data-state','M460 67 H500','data','session');
    edge('mic-stt','M220 187 H260','mic','stt');edge('stt-plan','M460 187 H500','stt','coordinator');
    edge('state-plan','M600 109 V145','session','coordinator','只读快照',612,132);
    edge('text-plan','M120 229 V245 H600 V229','mic','coordinator','文字直接进入调度',245,240);
    for(const node of nodes.filter(n=>ids.includes(n.id))){
      edge('plan-'+node.id,`M600 229 V247 H728 V${node.y-18} H${node.x+100} V${node.y}`, 'coordinator',node.id);
      const join=bottom-20;
      edge('agent-'+node.id,`M${node.x+100} ${node.y+84} V${node.y+94} H${node.x+220} V${join} H120 V${bottom}`,node.id,'verifier');
    }
    edge('check-tts',`M220 ${bottom+42} H260`,'verifier','tts','通过',232,bottom+32);
    edge('tts-play',`M460 ${bottom+42} H500`,'tts','playback','PCM',466,bottom+32);
    edge('play-plan',`M700 ${bottom+42} H735 V187 H700`,'playback','coordinator','播放中预生成 · 回执后提交',470,height-7,'cycle-edge');
    edge('repair',`M20 ${bottom+42} H8 V257 H120 V275`,'verifier',ids[0]||'none','失败 → 修正一次',20,bottom-5,'repair-edge');
    svg.append(edges);
    for(const node of nodes){
      const group=el('g',{transform:`translate(${node.x},${node.y})`,class:'graph-node','data-node':node.id,role:'button',tabindex:0});
      group.append(el('rect',{width:200,height:84,rx:10}),el('circle',{cx:15,cy:18,r:4,class:'node-dot'}),
                   el('text',{x:27,y:24,class:'node-title'},short(node.title,12)),
                   el('text',{x:13,y:45,class:'node-sub'},node.sub),el('text',{x:13,y:68,class:'node-status'}),el('title',{},node.title));
      group.onclick=()=>onSelect(node.actor);group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect(node.actor)}};
      svg.append(group);
    }
    root.append(svg);
  }
  for(const node of nodes){
    const group=root.querySelector(`[data-node="${node.id}"]`);let run=latest.get(node.actor),status=run?.status||'idle',detail=run?.detail;
    if(['list','session'].includes(node.id)){status=ids.length?'ready':'idle';detail=node.id==='list'?`${ids.length} 家餐厅`:'点击查看当前状态'}
    if(node.id==='data'){status=personas.size?'ready':'idle';detail='点击查看餐厅人格提示词'}
    if(node.id==='mic'){status=mic?'running':'idle';detail=mic?'麦克风上传中':'麦克风关闭 · 可输入文字'}
    const preview=run?.rawOutput?short(run.rawOutput.replace(/[\n{}"\[\]]/g,' '),25):detail;
    group.dataset.status=status;group.setAttribute('aria-label',`${node.title}：${labels[status]||status}，点击查看内容`);
    group.querySelector('.node-status').textContent=short(`${labels[status]||status} · ${preview||node.sub}`,26);
    group.querySelector('title').textContent=`${node.title}\n${detail||node.sub}\n${run?.rawOutput||''}`;
  }
  for(const path of root.querySelectorAll('[data-edge]')){
    const to=path.dataset.to,from=path.dataset.from,run=latest.get(to);
    let active=busy(run);
    if(from==='playback')active=active&&runs.some(r=>r.actor==='playback'&&r.status==='completed');
    if(from==='mic')active=to==='stt'&&busy(latest.get('stt'));
    if(ids.includes(from))active=active&&latest.has(from);
    if(path.dataset.edge==='repair'){const repair=[...runs].reverse().find(r=>r.stage==='repair');active=busy(repair);const restaurant=nodes.find(n=>n.id===repair?.actor);if(restaurant)path.setAttribute('d',`M20 ${bottom+42} H8 V257 H${restaurant.x+100} V${restaurant.y}`)}
    path.classList.toggle('flowing',Boolean(active));path.setAttribute('marker-end',`url(#wf-arrow-${active?'active':'normal'})`);
  }
}
