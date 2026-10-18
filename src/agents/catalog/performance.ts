// The stage's performance vocabulary: the part of agent-studio's web/data/catalog.json that
// Jev chooses from. Generated once from that file; the text is Jev criteria, keep it word for
// word (scripts/fixtures/jev-golden.json compares it against the Python).

export interface CatalogEntry { id: string; zh: string; desc: string; use?: string }
export interface Expression extends CatalogEntry { group: string }
export interface Gesture extends CatalogEntry { poses: readonly string[]; dir?: 'toward' }
export interface Act extends CatalogEntry { dur: number; dir?: 'toward' }

export const EXPRESSIONS = [
  { id: 'idle', zh: '待机', group: '基态', desc: '眉眼放松、浅笑、淡腮红，随呼吸轻微起伏。', use: '没轮到自己、也没被点名时的默认状态。' },
  { id: 'listen', zh: '倾听', group: '基态', desc: '眉微抬、头向发言者歪 4°、浅笑，瞳孔略放大。', use: '认真听别人说话，没有明显情绪。' },
  { id: 'pitch', zh: '自信推销', group: '积极', desc: '双眉高扬、眼睁大、露齿笑、腮红加深，说话嘴型放大 1.1 倍，头略后仰。', use: '热情地推销自家卖点、报价格。' },
  { id: 'proud', zh: '得意', group: '积极', desc: '双眉平抬、上眼皮半垂、斜嘴笑，头后仰 7°，带点优越感。', use: '自夸格调、讲自己有多高级。' },
  { id: 'wink', zh: '抛媚眼', group: '积极', desc: '一只眼弯成 ^、另一只睁着，露齿笑，头歪 7°，星光特效。', use: '卖点说完后的俏皮收尾、点睛。' },
  { id: 'star', zh: '星星眼', group: '积极', desc: '双眼变成金色旋转星星、大笑、腮红最深，眼睛放大 1.08 倍，星光特效。', use: '抓住机会、极度兴奋、被说中心意。' },
  { id: 'sly', zh: '坏笑', group: '挖苦', desc: '一侧眉挑起、另一侧压低，半眯眼，斜嘴笑带酒窝。', use: '准备拆台、挖苦或揭对手短处。' },
  { id: 'eyeroll', zh: '翻白眼', group: '挖苦', desc: '瞳孔上翻、上眼皮半垂、平嘴、头偏 -8°。', use: '对对手的夸张推销表示不屑、无语。' },
  { id: 'laugh', zh: '大笑', group: '积极', desc: '眼睛弯成 ^^、张大嘴笑、腮红加深，说话嘴型放大 1.2 倍。', use: '被笑点逗乐、嘲笑对手出丑、自己讲笑话。' },
  { id: 'shock', zh: '震惊', group: '受挫', desc: '眉猛抬、眼放大 1.17 倍、瞳孔缩小一半、O 形嘴，头顶弹出红色感叹号，伴随头部挤压回弹。', use: '被戳中痛点、听到意外消息的瞬间。' },
  { id: 'sweat', zh: '心虚流汗', group: '受挫', desc: '八字眉、目光躲闪向下、波浪嘴，额角汗滴下落、脸颊红线。', use: '被揭短后心虚、底气不足。' },
  { id: 'angry', zh: '生气', group: '受挫', desc: '眉内端狠压 23°、额头泛红、咬牙嘴，怒气符号跳动，头顶冒烟。', use: '被冒犯后的激烈反击、气急败坏。' },
  { id: 'win', zh: '胜利', group: '积极', desc: '眼睛弯成 ^^、大笑、腮红最深，星光特效。', use: '赢了、被用户选中、庆祝。' },
  { id: 'pout', zh: '落选嘟嘴', group: '受挫', desc: '八字眉、半闭眼看向下方、嘟嘴、腮红，头歪 7°。', use: '落选、被抢先、委屈但认了。' },
  { id: 'haughty', zh: '高傲', group: '挖苦', desc: '双眼闭成弧线、斜嘴笑、头后仰 9°，不屑看对方。', use: '端架子、看不上这场争吵。' },
  { id: 'think', zh: '思考', group: '中性', desc: '一侧眉挑起、视线看向右上方、平嘴、头歪 6°，头顶紫色问号。', use: '听到新信息在权衡、被问住。' },
  { id: 'kiss', zh: '飞吻', group: '积极', desc: '双眼闭合、噘嘴飞吻（带唇色）、腮红，星光特效，头后仰 6°。', use: '法式浪漫、告别、讨好观众。' },
  { id: 'smug', zh: '得意笑', group: '挖苦', desc: '眉一高一低、半眯眼、露齿笑，幸灾乐祸。', use: '看对手出丑、自己占上风。' },
  { id: 'nervous', zh: '紧张赔笑', group: '受挫', desc: '八字眉、眼放大、瞳孔缩小、勉强露齿笑、汗滴，说话嘴型略缩小。', use: '慌忙找补、结巴解释。' },
  { id: 'squeal', zh: '笑到挤眼', group: '积极', desc: '双眼挤成 > <、张嘴大笑、腮红最深。', use: '被笑点击中、笑到失控。' },
] as const satisfies readonly Expression[]

// Each gesture is drawn by one pose, or a right/left pair chosen by where the actor faces.
export const GESTURES = [
  { id: 'rest', zh: '自然垂手', poses: ['rest'], desc: '双臂自然下垂、手掌张开。', use: '无特别动作。' },
  { id: 'hip', zh: '双手叉腰', poses: ['hip'], desc: '双手握拳叉在腰间。', use: '生气、不服气、气势压人。' },
  { id: 'hip_one', zh: '单手叉腰', poses: ['hipR', 'hipL'], dir: 'toward', desc: '一只手叉腰，另一只手自然垂下。', use: '自信站姿、准备开讲。' },
  { id: 'hip_point', zh: '叉腰指人', poses: ['pointRhip', 'pointLhip'], dir: 'toward', desc: '一手叉腰、另一手直指对方。', use: '气势汹汹地点名对手、反驳。' },
  { id: 'point', zh: '伸手指人', poses: ['pointR', 'pointL'], dir: 'toward', desc: '一只手伸直指向对方。', use: '点名、揭短、指出对方问题。' },
  { id: 'thumb', zh: '竖大拇指', poses: ['thumbR', 'thumbL'], dir: 'toward', desc: '一手叉腰、另一手竖起大拇指。', use: '夸自己好、打包票、点赞。' },
  { id: 'wave', zh: '挥手招呼', poses: ['waveR', 'waveL'], dir: 'toward', desc: '一只手高举左右摆动（周期摆动）。', use: '热情招呼、来来来、打招呼。' },
  { id: 'wag', zh: '摇食指', poses: ['wagR', 'wagL'], dir: 'toward', desc: '一只手竖起食指左右摇（周期摆动）。', use: '啧啧啧、不对不对、说教挖苦。' },
  { id: 'present', zh: '摊手展示', poses: ['present', 'presentL'], dir: 'toward', desc: '一只手向侧前方摊开掌心。', use: '介绍菜品、展示卖点、请看。' },
  { id: 'shrug', zh: '摊手耸肩', poses: ['shrug'], desc: '双手在身侧摊开向上。', use: '无奈、不屑、算了吧。' },
  { id: 'clasp', zh: '双手合握', poses: ['clasp'], desc: '双手握拳合在胸前。', use: '期待、拜托、激动地憧憬。' },
  { id: 'kiss', zh: '飞吻', poses: ['kissR', 'kissOut'], desc: '手指贴唇再向外送出（两段动作）。', use: '浪漫、告别、讨好。' },
  { id: 'belly', zh: '捧腹', poses: ['belly'], desc: '双手捂在肚子前。', use: '笑弯腰、吃饱满足。' },
  { id: 'belly_one', zh: '单手拍肚', poses: ['bellyR'], desc: '一只手拍在肚子上。', use: '得意、心满意足、胸有成竹。' },
  { id: 'cheer', zh: '双手欢呼', poses: ['cheer'], desc: '双臂高举过头。', use: '胜利、欢呼。' },
  { id: 'handsUp', zh: '双手举起', poses: ['handsUp'], desc: '双手举在肩上方、小幅抖动（周期摆动）。', use: '慌张辩解、投降、别激动。' },
  { id: 'bow', zh: '鞠躬手势', poses: ['bow'], desc: '双手收在身前配合低头。', use: '礼貌致意、认输告别。' },
] as const satisfies readonly Gesture[]

export const ACTS = [
  { id: 'none', zh: '无', dur: 0, desc: '不加身体动作，只保留呼吸和摆动。', use: '平静说话。' },
  { id: 'hop', zh: '小跳', dur: 0.35, desc: '预备下蹲 → 跳起 38px（影子缩小变淡）→ 落地压扁回弹。', use: '吓一跳、兴奋得一蹦。' },
  { id: 'jump', zh: '大跳', dur: 0.55, desc: '同小跳但跳起 110px。', use: '胜利、欢呼。' },
  { id: 'shake', zh: '左右抖', dur: 0.5, desc: '身体左右急抖 6 次、幅度 7px 衰减。', use: '气得跺脚、激动强调。' },
  { id: 'bounce', zh: '连续弹跳', dur: 1.2, desc: '身体连续小幅上下弹（10px）伴随轻微伸缩。', use: '笑得发抖、开心得停不下来。' },
  { id: 'nod', zh: '点头', dur: 0.4, desc: '头部向下点 10px 后回位。', use: '同意、确认、嗯嗯。' },
  { id: 'lean', zh: '倾身凑近', dur: 0.8, dir: 'toward', desc: '身体向一侧倾斜 8° 并平移 10px，保持后回正。', use: '凑近挖苦、套近乎、说悄悄话。' },
  { id: 'bow', zh: '鞠躬', dur: 0.8, desc: '头部下沉 26px、身体压低 7%。', use: '致意、认输、告别。' },
  { id: 'puff', zh: '鼓起胸膛', dur: 0.6, desc: '身体横向膨胀 5%、纵向 4%。', use: '自豪、气鼓鼓。' },
  { id: 'shiver', zh: '发抖', dur: 1.2, desc: '身体高频细抖 2.2px。', use: '心虚、紧张、害怕。' },
  { id: 'stepIn', zh: '上前一步', dur: 1.0, desc: '整体放大 6% 像向镜头走近，结束后回位。', use: '向观众推销、强调重点。' },
] as const satisfies readonly Act[]

// The faces a listener may react with, and what each one means for Jev.
export const REACTIONS = ['listen', 'shock', 'sweat', 'angry', 'laugh', 'squeal', 'eyeroll', 'smug', 'sly', 'think', 'pout', 'nervous', 'haughty', 'star', 'idle'] as const

export const DELIVERIES = [
  { id: 'neutral', zh: '平常' },
  { id: 'excited', zh: '兴奋热情' },
  { id: 'angry', zh: '生气' },
  { id: 'mocking', zh: '挖苦调侃' },
  { id: 'flustered', zh: '慌张' },
  { id: 'sad', zh: '委屈' },
] as const satisfies readonly { id: string; zh: string }[]

export const STANCES = [
  { id: 'pitch', zh: '自我推销', desc: '介绍自家卖点，没有针对别人。' },
  { id: 'rebut', zh: '反驳', desc: '直接否定被引用者说的话。' },
  { id: 'mock', zh: '挖苦嘲讽', desc: '拿被引用者的话开玩笑、揭短。' },
  { id: 'defend', zh: '辩解找补', desc: '被说中后为自己辩护、找台阶。' },
  { id: 'agree', zh: '附和认同', desc: '同意被引用者，或顺着说。' },
  { id: 'concede', zh: '认输退让', desc: '承认不如对方、礼貌认输。' },
] as const satisfies readonly { id: string; zh: string; desc: string }[]

// Where the speaker looks, and the speech-bubble styles (their criteria live with the questions).
export const GAZES = ['quoted', 'other', 'audience'] as const
export const BUBBLES = ['normal', 'shout', 'shaky'] as const

export type ExpressionId = (typeof EXPRESSIONS)[number]['id']
export type GestureId = (typeof GESTURES)[number]['id']
export type PoseId = (typeof GESTURES)[number]['poses'][number]
export type ActId = (typeof ACTS)[number]['id']
export type ReactionId = (typeof REACTIONS)[number]
export type DeliveryId = (typeof DELIVERIES)[number]['id']
export type StanceId = (typeof STANCES)[number]['id']
export type GazeId = (typeof GAZES)[number]
export type BubbleId = (typeof BUBBLES)[number]

export const REACTION_CRITERIA: Record<ReactionId, string> = {
  shock: '被直接点名、揭短或听到意外消息的一瞬间：眉猛抬、O 形嘴、头顶感叹号。被针对的人最常见的第一反应。',
  sweat: '自家短处被说中、被问住，心虚流汗，底气不足。',
  angry: '被冒犯、被嘲讽到忍不住要回嘴，气鼓鼓、冒烟。',
  laugh: '旁观别人出丑、听到好笑的挖苦，忍不住大笑捧腹。',
  squeal: '笑点特别强（例如夸张的比喻），笑到挤眼、停不下来。',
  eyeroll: '对手在自吹自擂、说大话时的不屑：翻白眼。',
  smug: '看到对手吃瘪、自己顺势占上风时的幸灾乐祸。',
  sly: '憋着坏主意、马上要接话反击时的坏笑（少用）。',
  think: '听到新的信息或洞察（例如主持人分析用户需求），需要想一想。',
  pout: '自己被比下去、被抢先、明显输了时的委屈嘟嘴。',
  nervous: '被追问、被逼到墙角时的紧张赔笑。',
  haughty: '自视甚高、不屑参与这种争论（法式主厨常见）。',
  star: '听到对自己特别有利的消息，眼睛发光。',
  listen: '这句话跟自己基本无关、只是平铺直叙时的认真倾听（尽量少用）。',
  idle: '完全没在听（几乎不用）。',
}

// The whole vocabulary as one object, keyed like catalog.json (the avatar generator takes it).
export const PERFORMANCE_CATALOG = {
  expressions: EXPRESSIONS,
  gestures: GESTURES,
  acts: ACTS,
  reactions: REACTIONS,
  reactionCriteria: REACTION_CRITERIA,
  deliveries: DELIVERIES,
  stances: STANCES,
} as const
