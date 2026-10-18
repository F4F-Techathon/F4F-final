// The rig's asset vocabulary beyond what Jev chooses from: every pose, mouth shape, viseme, eye, hand and
// effect the renderer can draw (agent-studio/web/data/catalog.json). Expressions, gestures and acts come
// from src/agents/catalog/performance.ts; `film` notes where the film used each one.

export interface Pose { id: string; zh: string; gesture: string | null; film: readonly string[] }
export interface MouthShape { id: string; zh: string; desc: string; expr: readonly string[] }
export interface Viseme { id: string; zh: string; sound: string; desc: string }
export interface EyeShape { id: string; zh: string; desc: string; expr: readonly string[] }
export interface HandShape { id: string; zh: string; desc: string }
export interface Effect { id: string; zh: string; desc: string; expr: readonly string[] }

export const POSES: readonly Pose[] = [
  {"id": "rest", "zh": "自然垂手", "gesture": "rest", "film": ["大多数倾听时刻"]},
  {"id": "hip", "zh": "双手叉腰", "gesture": "hip", "film": ["H1 36% 蓉姐", "P0 蓉姐", "P2 华叔", "P3 蓉姐", "H3 华叔"]},
  {"id": "hipL", "zh": "左手叉腰", "gesture": "hip_one", "film": []},
  {"id": "hipR", "zh": "右手叉腰", "gesture": "hip_one", "film": ["蓉姐亮相", "R1 开口"]},
  {"id": "thumbR", "zh": "右手大拇指", "gesture": "thumb", "film": ["R1 67%", "R4 60%", "O4 后华叔", "片尾"]},
  {"id": "thumbL", "zh": "左手大拇指", "gesture": "thumb", "film": []},
  {"id": "waveL", "zh": "左手挥手", "gesture": "wave", "film": []},
  {"id": "waveR", "zh": "右手挥手", "gesture": "wave", "film": ["R4 开口", "地图集结"]},
  {"id": "pointL", "zh": "左手指", "gesture": "point", "film": []},
  {"id": "pointR", "zh": "右手指", "gesture": "point", "film": ["H2 华叔指 Pierre"]},
  {"id": "pointRhip", "zh": "叉腰右手指", "gesture": "hip_point", "film": ["R2 蓉姐指华叔", "R3 蓉姐指 Pierre"]},
  {"id": "pointLhip", "zh": "叉腰左手指", "gesture": "hip_point", "film": ["P3 Pierre 指蓉姐"]},
  {"id": "cheer", "zh": "双手欢呼", "gesture": "cheer", "film": ["被选中后蓉姐"]},
  {"id": "shrug", "zh": "摊手耸肩", "gesture": "shrug", "film": ["P0 Pierre"]},
  {"id": "clasp", "zh": "双手合握", "gesture": "clasp", "film": ["O3 66% 蓉姐"]},
  {"id": "kissR", "zh": "飞吻·贴唇", "gesture": "kiss", "film": ["Pierre 亮相", "P1 72%", "O4 后", "片尾"]},
  {"id": "kissOut", "zh": "飞吻·送出", "gesture": "kiss", "film": ["Pierre 亮相", "P1 90%", "O4 后", "片尾"]},
  {"id": "belly", "zh": "捧腹", "gesture": "belly", "film": ["华叔亮相", "H2 30% 蓉姐", "R3 65% 华叔", "片尾"]},
  {"id": "bellyR", "zh": "右手拍肚", "gesture": "belly_one", "film": ["H1 43% 华叔"]},
  {"id": "wagR", "zh": "右手摇指", "gesture": "wag", "film": ["H1 华叔开口"]},
  {"id": "wagL", "zh": "左手摇指", "gesture": "wag", "film": []},
  {"id": "present", "zh": "右手摊开", "gesture": "present", "film": []},
  {"id": "presentL", "zh": "左手摊开", "gesture": "present", "film": ["P1 Pierre"]},
  {"id": "handsUp", "zh": "双手举起", "gesture": "handsUp", "film": ["P2 Pierre"]},
  {"id": "bow", "zh": "鞠躬手势", "gesture": "bow", "film": ["P4 Pierre"]},
  {"id": "run", "zh": "跑步摆臂", "gesture": null, "film": ["地图上三人跑向帐篷"]},
]

export const MOUTHS: readonly MouthShape[] = [
  {"id": "smile", "zh": "微笑", "desc": "上弯弧线。", "expr": ["idle", "listen"]},
  {"id": "grin", "zh": "露齿笑", "desc": "张口露上齿与舌。", "expr": ["pitch", "wink", "smug", "nervous"]},
  {"id": "laugh", "zh": "大笑", "desc": "大张口、上齿、舌。", "expr": ["star", "laugh", "win", "squeal"]},
  {"id": "smirk", "zh": "斜嘴笑", "desc": "单侧上扬 + 酒窝。", "expr": ["proud", "sly", "haughty"]},
  {"id": "flat", "zh": "平嘴", "desc": "一字线。", "expr": ["eyeroll", "think"]},
  {"id": "frown", "zh": "撇嘴", "desc": "下弯弧线。", "expr": []},
  {"id": "O", "zh": "O 形嘴", "desc": "圆形张口带舌。", "expr": ["shock"]},
  {"id": "pout", "zh": "嘟嘴", "desc": "小下弯弧线。", "expr": ["pout"]},
  {"id": "wavy", "zh": "波浪嘴", "desc": "波浪线（心虚）。", "expr": ["sweat"]},
  {"id": "angry", "zh": "咬牙嘴", "desc": "上下齿咬合。", "expr": ["angry"]},
  {"id": "kiss", "zh": "噘嘴", "desc": "小圆唇带唇色。", "expr": ["kiss"]},
]

export const VISEMES: readonly Viseme[] = [
  {"id": "v0", "zh": "闭", "sound": "b p m · 静音 · 句间停顿", "desc": "闭合弧线，不随开合缩放。"},
  {"id": "v1", "zh": "啊", "sound": "a ia ua ai an ang（粤 aa a）", "desc": "大张口、上齿、舌，开合 0.42–1.0。"},
  {"id": "v2", "zh": "哦", "sound": "o uo ou ao ong（粤 o oe eo）", "desc": "圆口、舌。"},
  {"id": "v3", "zh": "呃", "sound": "e ei en eng er ie ian ui", "desc": "扁宽张口、上齿。"},
  {"id": "v4", "zh": "衣", "sound": "i in ing · zhi chi shi ri zi ci si", "desc": "扁口露上下齿。"},
  {"id": "v5", "zh": "乌", "sound": "u ü（粤 u yu）", "desc": "小圆口。"},
  {"id": "v6", "zh": "齿", "sound": "声母 f zh ch sh z c s r 的起音", "desc": "上下齿咬合露白。"},
]

export const EYES: readonly EyeShape[] = [
  {"id": "n", "zh": "常态眼", "desc": "眼白 + 瞳孔（可缩放、可注视方向）+ 上下眼皮遮罩；蓉姐带眼线翅。", "expr": ["idle", "listen", "pitch", "proud", "sly", "eyeroll", "shock", "sweat", "angry", "pout", "think", "smug", "nervous"]},
  {"id": "happy", "zh": "笑眼 ^", "desc": "上弯弧线。", "expr": ["laugh", "win", "wink(右眼)"]},
  {"id": "closed", "zh": "闭眼 ‿", "desc": "下弯弧线；眨眼时上眼皮 > 0.9 也切换为此形。", "expr": ["haughty", "kiss"]},
  {"id": "squeeze", "zh": "挤眼 ><", "desc": "向内的尖角折线。", "expr": ["squeal"]},
  {"id": "star", "zh": "星星眼", "desc": "金色五角星，持续小幅旋转。", "expr": ["star"]},
]

export const HANDS: readonly HandShape[] = [
  {"id": "open", "zh": "张开手", "desc": "圆掌 + 拇指。"},
  {"id": "fist", "zh": "握拳", "desc": "圆拳 + 两道指缝。"},
  {"id": "thumb", "zh": "大拇指", "desc": "握拳竖起拇指。"},
  {"id": "point", "zh": "食指", "desc": "握拳伸出食指。"},
]

export const EFFECTS: readonly Effect[] = [
  {"id": "sweat", "zh": "汗滴", "desc": "额角蓝色水滴循环下落 40px。", "expr": ["sweat", "nervous"]},
  {"id": "anger", "zh": "怒气符号", "desc": "红色十字青筋，2.5 Hz 脉动。", "expr": ["angry"]},
  {"id": "steam", "zh": "头顶冒烟", "desc": "三朵白烟循环上升放大淡出。", "expr": ["angry"]},
  {"id": "excl", "zh": "感叹号", "desc": "头顶红色 !，回弹弹出，0.9 秒后消失。", "expr": ["shock"]},
  {"id": "quest", "zh": "问号", "desc": "头侧紫色 ?。", "expr": ["think"]},
  {"id": "lines", "zh": "脸红线", "desc": "两颊斜线（尴尬）。", "expr": ["sweat"]},
  {"id": "tears", "zh": "泪滴", "desc": "两颊蓝色泪滴。", "expr": []},
  {"id": "sparkle", "zh": "星光", "desc": "四颗金色四角星，1.8 Hz 呼吸缩放。", "expr": ["wink", "star", "win", "kiss"]},
]

/** Where the film used an expression or an act, for the film characters' detail drawer. */
export const FILM_NOTES: { expr: Record<string, readonly string[]>; act: Record<string, readonly string[]> } = {
  "expr": {
    "idle": [
      "HUD 出现后三人回到基态"
    ],
    "listen": [
      "登台时三人倾听",
      "R1 开头华叔转头倾听"
    ],
    "pitch": [
      "蓉姐名牌亮相",
      "R1「来我屋头嘛！」开口"
    ],
    "proud": [
      "P1「烛光，红酒，七道菜」",
      "Pierre 亮相收尾"
    ],
    "wink": [
      "R1 68% 蓉姐收尾",
      "R4 62% 蓉姐收尾"
    ],
    "star": [
      "O3 66% 蓉姐听到「约会又馋辣」",
      "R4「约会？」开口"
    ],
    "sly": [
      "H1 华叔开口拆台",
      "R3 蓉姐讲牛排笑话",
      "P1 52% 华叔"
    ],
    "eyeroll": [
      "R1 54% 华叔",
      "P0 蓉姐和华叔",
      "R4 21% 华叔"
    ],
    "laugh": [
      "R2 15% Pierre 看戏",
      "H2 华叔笑说「八百八」",
      "R3 62% 蓉姐"
    ],
    "shock": [
      "H1 12% 蓉姐被说「辣到嘴肿」",
      "H2 28% Pierre 被说「八百八」",
      "R3 65% Pierre「喊妈妈」"
    ],
    "sweat": [
      "R2 26% 华叔被反问「四个钟」",
      "H2 60% Pierre",
      "O3 70% Pierre"
    ],
    "angry": [
      "H1 36% 蓉姐",
      "R2「四个钟？」反击",
      "P3「那叫艺术！」"
    ],
    "win": [
      "光标点选后蓉姐"
    ],
    "pout": [
      "R4 21% Pierre",
      "H3「又畀佢抢先咗」",
      "选定后华叔"
    ],
    "haughty": [
      "P0「Mon Dieu…」",
      "R1 17% Pierre"
    ],
    "think": [
      "O3 三人抬头想",
      "P1 46% 蓉姐"
    ],
    "kiss": [
      "Pierre 亮相",
      "P1 72%",
      "P4「Bon appétit !」"
    ],
    "smug": [
      "华叔亮相",
      "H1 45% 华叔",
      "P3 后蓉姐"
    ],
    "nervous": [
      "P2「那、那是周末！」"
    ],
    "squeal": [
      "R3 65% 华叔"
    ]
  },
  "act": {
    "hop": [
      "H1 12% 蓉姐吓一跳",
      "H2 28% Pierre",
      "R4 56% 蓉姐"
    ],
    "jump": [
      "被选中后蓉姐"
    ],
    "shake": [
      "R2 蓉姐",
      "P3 Pierre"
    ],
    "bounce": [
      "H2 华叔整句",
      "R3 62% 蓉姐",
      "R3 65% 华叔"
    ],
    "lean": [
      "H1 华叔凑向蓉姐"
    ],
    "bow": [
      "P4 Pierre"
    ],
    "puff": [
      "华叔亮相",
      "H1 36% 蓉姐气鼓鼓"
    ],
    "shiver": [
      "R2 26% 华叔",
      "P2 Pierre"
    ],
    "stepIn": [
      "R1 蓉姐整句",
      "R4 蓉姐"
    ]
  }
}

/** Expression groups, coloured as in agent-studio. */
export const GROUP_COLORS: Record<string, string> = { 积极: '#E2B85C', 挖苦: '#A18CE6', 受挫: '#E06C5F', 中性: '#8A93A6', 基态: '#8A93A6' }
