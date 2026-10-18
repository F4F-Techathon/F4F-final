import type { Gender, HumanBody, KitLook, MascotBody } from '../rig/types.ts'
import type { ShopInfo } from './shop.ts'

// A chain people know by its mascot is played by that mascot (src/agents/rig/mascots.js), not by a
// generic owner. `match` is tried on the shop name and owner only, so a shop that merely mentions a
// rival stays itself. Brand marks belong to their owners: demo use only.
//
// The fast-food chains in the dataset are dressed on a human template instead (`parts`): KFC's colonel in his white
// suit with a bucket, McDonald's clown, 老乡鸡's straw-hatted farmer (the farmer on its sign), and crews in each
// chain's colours holding its signature food. Where a chain has no official character (德克士, Popeyes, Taco Bell,
// 萨莉亚, 食其家), the character is this demo's own design from the brand's colours and best-known food.
// A second branch of the same chain on one stage plays `crew` instead (src/agents/generation/distinct.ts).
export interface BrandCrew { name: string; gender: Gender; parts: Partial<KitLook> }
export interface Brand {
  id: string
  name: string
  match: RegExp
  mascot: string
  body: MascotBody | HumanBody
  /** A human template's uniform, hair and held food; a mascot body needs none. */
  parts?: Partial<KitLook>
  crew?: BrandCrew[]
  gender: Gender
  theme: string
  color: string
  accent: string
  personality: string
  cuisine: string
  look: string
  persona: string
  hello: string
  keywords: string[]
}

export const BRANDS: Brand[] = [
  {
    id: 'mixue', name: '蜜雪冰城', match: /蜜雪冰城|mixue|雪王/i, mascot: '雪王', body: 'snowking', gender: 'male', theme: '#E60012', color: '蜜雪红',
    accent: 'zh', personality: 'cute', cuisine: '冰淇淋与茶饮',
    look: '雪人：圆头圆身，头戴白色王冠、披红色斗篷，手握冰淇淋权杖；蓝眼睛、橙色胡萝卜鼻、咧嘴吐舌头；粗黑描边',
    persona: '蜜雪冰城的吉祥物雪王：戴王冠、披红斗篷的雪人，社牛，爱唱「你爱我，我爱你，蜜雪冰城甜蜜蜜」；主打便宜大碗，冰淇淋和柠檬水是招牌。',
    hello: '你爱我，我爱你，蜜雪冰城甜蜜蜜！我是雪王！', keywords: ['雪王', '蜜雪', '甜蜜蜜'],
  },
  {
    id: 'chabaidao', name: '茶百道', match: /茶百道|chabaidao|cha\s*bai\s*dao/i, mascot: '熊猫', body: 'panda', gender: 'male', theme: '#1F2C8F', color: '茶百道蓝',
    accent: 'sc', personality: 'honest', cuisine: '鲜果茶',
    look: '熊猫：大圆脑袋、圆耳朵、八字黑眼圈，深蓝与白两色，捧一杯插着吸管的鲜果茶',
    persona: '茶百道的熊猫：成都来的熊猫，憨态可掬，抱着一杯鲜果茶不撒手，说话慢悠悠、实诚；主打鲜果和中国茶。',
    hello: '大家好，我是茶百道的熊猫！鲜果配中国茶，来一杯嘛！', keywords: ['熊猫', '百道'],
  },
  {
    id: 'chagee', name: '霸王茶姬', match: /霸王茶姬|chagee/i, mascot: '茶姬', body: 'opera', gender: 'female', theme: '#D7262E', color: '中国红',
    accent: 'zh', personality: 'refined', cuisine: '原叶鲜奶茶',
    look: '京剧旦角：头戴白色绒球头面、两侧垂珠，红色戏服配白色水袖；白净的脸、丹凤眼、樱桃小口；红白两色',
    persona: '霸王茶姬的茶姬：京剧旦角扮相，端庄优雅，说话带点戏腔；讲究原叶鲜奶茶，招牌是伯牙绝弦。',
    hello: '各位看官，茶姬这厢有礼了！原叶鲜奶茶，来一杯伯牙绝弦吧！', keywords: ['茶姬', '伯牙绝弦'],
  },
  {
    id: 'sexytea', name: '茶颜悦色', match: /茶颜悦色|sexy\s*tea/i, mascot: '仕女', body: 'lady', gender: 'female', theme: '#A61E36', color: '酒红',
    accent: 'hunan', personality: 'shy', cuisine: '新中式茶饮',
    look: '古风仕女：乌黑高髻插簪，素色交领上襦配酒红长裙、宽袖，手执画着梅枝的团扇；墨线描边、酒红为主色',
    persona: '茶颜悦色的仕女：长沙来的古风姑娘，温婉含蓄，爱用团扇半遮面，说话文绉绉；招牌幽兰拿铁。',
    hello: '小女子是茶颜悦色的仕女，一杯幽兰拿铁，与君共赏。', keywords: ['仕女', '茶颜', '幽兰拿铁'],
  },
  {
    id: 'starbucks', name: '星巴克', match: /星巴克|starbucks/i, mascot: '塞壬', body: 'siren', gender: 'female', theme: '#00704A', color: '星巴克绿',
    accent: 'enzh', personality: 'refined', cuisine: '咖啡',
    look: '双尾美人鱼：头戴缀星王冠，波浪长卷发，两条鱼尾从身侧扬起；绿白两色',
    persona: '星巴克的塞壬：从海上来的双尾美人鱼，优雅又神秘，讲究咖啡和「第三空间」；招牌拿铁和星冰乐。',
    hello: 'Hi～我是星巴克的塞壬！一杯拿铁，开启美好的一天！', keywords: ['塞壬', '美人鱼'],
  },
  {
    id: 'kfc', name: '肯德基', match: /肯德基|\bKFC\b/i, mascot: '上校', body: 'm_regular', gender: 'male', theme: '#E4002B', color: '肯德基红',
    accent: 'enzh', personality: 'pro', cuisine: '炸鸡汉堡',
    look: '肯德基上校：雪白的头发和山羊胡、黑框眼镜、白色西装配黑色细绳领结，手提红白条纹的全家桶',
    persona: '肯德基的上校：白西装、白山羊胡、黑框眼镜的老派绅士，老练干脆，讲究炸鸡的火候和秘方；主打原味鸡、香辣鸡腿堡和全家桶。',
    hello: '嗨，我是肯德基的上校！秘制炸鸡，原汁原味！', keywords: ['上校', '肯德基', 'KFC', '全家桶'],
    parts: { age: 'old', hair: 'side', hairColor: '#F4F2EC', outfit: 'suit', top: '#F7F5EF', pants: '#EFEBE3', hat: 'none', accessories: ['glasses', 'goatee', 'bowtie'], prop: 'bucket', skin: '#F6CBA9', trim: '#E4002B' },
    crew: [{ name: '炸鸡小哥', gender: 'male', parts: { age: 'young', hair: 'crew', outfit: 'polo', top: '#E4002B', trim: '#FFFFFF', hat: 'visor', prop: 'drumstick', accessories: [] } }],
  },
  {
    id: 'mcdonalds', name: '麦当劳', match: /麦当劳|mcdonald/i, mascot: '麦当劳叔叔', body: 'm_tall', gender: 'male', theme: '#DA291C', color: '麦当劳红',
    accent: 'enzh', personality: 'bold', cuisine: '汉堡薯条',
    look: '麦当劳叔叔：红色爆炸卷发、白脸红鼻子、红色大笑嘴，黄色连体服配红色条纹袖和红色大头鞋，手捧一盒薯条',
    persona: '麦当劳叔叔：红卷发、红鼻子、黄色连体服的小丑，热情爱逗乐，最会哄人开心；主打巨无霸、麦辣鸡腿堡和薯条。',
    hello: '哈喽～我是麦当劳叔叔！薯条刚出锅，快来！', keywords: ['麦当劳叔叔', '麦当劳', '巨无霸', '薯条'],
    parts: { age: 'middle', hair: 'clown', hairColor: '#E0302A', outfit: 'jumpsuit', top: '#FFC72C', trim: '#DA291C', shoes: '#DA291C', hat: 'none', accessories: ['clownface'], prop: 'fries', skin: '#FFF6EE' },
    crew: [
      { name: '麦麦小姐姐', gender: 'female', parts: { age: 'young', hair: 'ponytail', outfit: 'polo', top: '#DA291C', trim: '#FFC72C', hat: 'visor', prop: 'fries', accessories: [] } },
      { name: '汉堡小哥', gender: 'male', parts: { age: 'young', hair: 'side', outfit: 'polo', top: '#FFC72C', trim: '#DA291C', hat: 'visor', prop: 'burger', accessories: [] } },
    ],
  },
  {
    id: 'laoxiangji', name: '老乡鸡', match: /老乡鸡|肥西老母鸡/, mascot: '老乡', body: 'm_round', gender: 'male', theme: '#2E7D32', color: '老乡鸡绿',
    accent: 'zh', personality: 'honest', cuisine: '中式快餐',
    look: '养鸡老乡：头戴草帽、穿蓝布衫系绿围裙的老农（老乡鸡招牌上的草帽农夫），怀里抱着一只老母鸡',
    persona: '老乡鸡的老乡：戴草帽、穿蓝布衫的养鸡老农，憨厚实在，开口就是散养老母鸡和一碗鸡汤；主打肥西老母鸡汤和农家小炒肉。',
    hello: '老乡们好！我是老乡鸡的老乡，一碗老母鸡汤，暖胃又暖心！', keywords: ['老乡', '老乡鸡', '老母鸡汤'],
    parts: { age: 'old', hair: 'side', outfit: 'shirt', top: '#3D6FAF', hat: 'straw', trim: '#2E7D32', prop: 'hen', accessories: [], skin: '#EBB892' },
    crew: [{ name: '鸡汤阿姨', gender: 'female', parts: { age: 'middle', hair: 'bun', outfit: 'polo', top: '#2E7D32', trim: '#FFFFFF', hat: 'none', prop: 'bowl', accessories: [] } }],
  },
  {
    id: 'subway', name: '赛百味', match: /赛百味|subway/i, mascot: '小麦', body: 'm_regular', gender: 'male', theme: '#008C15', color: '赛百味绿',
    accent: 'enzh', personality: 'cute', cuisine: '三明治',
    look: '三明治师傅：绿色遮阳帽檐、绿色 Polo 衫配黄色领口，举着一根长长的三明治',
    persona: '赛百味的小麦：现做三明治的年轻师傅，轻快机灵、会算账，最爱讲「想加什么菜随你挑」；主打现烤面包和自选配菜。',
    hello: 'Hi～我是赛百味的小麦！面包现烤，配菜随你挑！', keywords: ['小麦', '赛百味', 'Subway', '三明治'],
    parts: { age: 'young', hair: 'crew', outfit: 'polo', top: '#008C15', trim: '#FFC600', hat: 'visor', prop: 'sub', accessories: [] },
    crew: [{ name: '赛百味小姐姐', gender: 'female', parts: { age: 'young', hair: 'ponytail', outfit: 'polo', top: '#FFC600', trim: '#008C15', hat: 'visor', prop: 'sub', accessories: [] } }],
  },
  {
    id: 'dicos', name: '德克士', match: /德克士|dicos/i, mascot: '德克', body: 'm_tall', gender: 'male', theme: '#D7261E', color: '德克士红',
    accent: 'enzh', personality: 'bold', cuisine: '脆皮炸鸡',
    look: '炸鸡牛仔：棕色牛仔帽、小胡子、红色 Polo 衫配黄色领口，手举一只脆皮炸鸡腿',
    persona: '德克士的德克：戴牛仔帽、留小胡子的炸鸡牛仔，豪爽爱吹牛，三句不离「咔滋脆」；主打脆皮炸鸡和手枪腿。',
    hello: 'Howdy！德克士的德克来了，脆皮炸鸡，咔滋脆！', keywords: ['德克', '德克士', '脆皮炸鸡'],
    parts: { age: 'middle', hair: 'side', outfit: 'polo', top: '#D7261E', trim: '#F5B700', hat: 'cowboy', prop: 'drumstick', accessories: ['mustache'] },
  },
  {
    id: 'popeyes', name: 'Popeyes', match: /popeyes|派派思|博派/i, mascot: '路易', body: 'm_round', gender: 'male', theme: '#F26522', color: 'Popeyes 橙',
    accent: 'enzh', personality: 'fiery', cuisine: '路易斯安那炸鸡',
    look: '路易斯安那大厨：橙色贝雷帽、橙色 Polo 衫配白领口，卷发，手捧一个炸鸡堡',
    persona: 'Popeyes 的路易：从路易斯安那来的炸鸡大厨，热情爱起哄，讲究腌料和香料；主打路易斯安那风味炸鸡和炸鸡堡。',
    hello: 'Hey～我是 Popeyes 的路易！路易斯安那炸鸡，香辣带劲！', keywords: ['路易', 'Popeyes', '炸鸡堡'],
    parts: { age: 'middle', hair: 'curly', outfit: 'polo', top: '#F26522', trim: '#FFFFFF', hat: 'beret', prop: 'burger', accessories: [] },
  },
  {
    id: 'tacobell', name: 'Taco Bell', match: /taco\s*bell|塔可钟/i, mascot: '塔可', body: 'f_regular', gender: 'female', theme: '#702082', color: '塔可钟紫',
    accent: 'eszh', personality: 'cute', cuisine: '墨西哥风味快餐',
    look: '塔可店员：紫色遮阳帽檐、紫色 Polo 衫配粉色领口、长发戴耳环，手里一只塔可',
    persona: 'Taco Bell 的塔可：紫色工服的店员姐姐，活泼爱热闹，张口就是「¡Olé!」；主打塔可、墨西哥卷饼和玉米片。',
    hello: '¡Hola！我是 Taco Bell 的塔可，脆皮塔可来一个！', keywords: ['塔可', 'Taco Bell', '塔可钟'],
    parts: { age: 'young', hair: 'long', outfit: 'polo', top: '#702082', trim: '#EC1D8C', hat: 'visor', prop: 'taco', accessories: ['earrings'] },
  },
  {
    id: 'saizeriya', name: '萨莉亚', match: /萨莉亚|saizeriya/i, mascot: '萨莉', body: 'f_petite', gender: 'female', theme: '#00843D', color: '萨莉亚绿',
    accent: 'itzh', personality: 'cute', cuisine: '意式简餐',
    look: '意式餐厅服务员：齐耳短发、白衬衫配绿色背带围裙和红色领结，端着一块披萨',
    persona: '萨莉亚的萨莉：白衬衫、红领结的意式餐厅服务员，俏皮会算账，最爱说「这个价在别处只够喝杯水」；主打平价披萨、意面和焗饭。',
    hello: 'Ciao～我是萨莉亚的萨莉！十几块的披萨，来一块！', keywords: ['萨莉', '萨莉亚', '披萨'],
    parts: { age: 'young', hair: 'bob', outfit: 'shirt', top: '#FFFFFF', trim: '#CE2B37', hat: 'none', prop: 'pizza', accessories: ['bowtie'] },
  },
  {
    id: 'sukiya', name: '食其家', match: /食其家|sukiya|すき家/i, mascot: '阿食', body: 'm_regular', gender: 'male', theme: '#E8380D', color: '食其家橙',
    accent: 'jazh', personality: 'pro', cuisine: '牛丼咖喱',
    look: '牛丼店员：橙色包头巾、橙色 Polo 衫配白领口，捧着一碗牛丼',
    persona: '食其家的阿食：手脚麻利的牛丼店员，认真讲究，开口就是「出餐快、肉铺满」；主打牛丼和咖喱饭。',
    hello: '欢迎光临！我是食其家的阿食，牛丼一碗，马上就好！', keywords: ['阿食', '食其家', '牛丼'],
    parts: { age: 'young', hair: 'crew', outfit: 'polo', top: '#E8380D', trim: '#FFFFFF', hat: 'bandana', prop: 'bowl', accessories: [] },
  },
]

export function matchBrand(shop: Pick<ShopInfo, 'name' | 'owner'>): Brand | null {
  const hay = [shop.name, shop.owner].filter(Boolean).join(' ')
  return BRANDS.find((brand) => brand.match.test(hay)) || null
}
