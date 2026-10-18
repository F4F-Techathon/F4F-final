// The design vocabulary a generated host is described in, ported verbatim from
// agent-studio/server/agents.py: what the look step asks Jev about, and what its keyword
// fallback picks from. Key order matters: the rules index into these lists by seed.
import type { Gender, Hair, HumanBody, Outfit, Hat } from '../rig/types.ts'

export const HAIRS: Record<Gender, Partial<Record<Hair, string>>> = {
  female: { bun: '高发髻：干练的传统老板娘', bob: '齐耳短发：利落、文艺', long: '披肩长发：温柔、精致', ponytail: '马尾：年轻、有活力' },
  male: { side: '侧分短发：稳重的中年老板', crew: '寸头：干脆、实在的手艺人', curly: '卷发：随性的外国主厨或文艺青年', bald: '光头：豪爽的老师傅' },
}
export const HAIR_ZH: Record<Hair, string> = { bun: '高发髻', bob: '齐耳短发', long: '披肩长发', ponytail: '马尾', side: '侧分短发', crew: '寸头', curly: '卷发', bald: '光头', clown: '小丑红卷发' }

export type Build = 'short' | 'regular' | 'tall'
export const BUILDS: Record<Build, string> = { short: '娇小或矮壮：亲切、接地气', regular: '标准身材', tall: '高挑或高大：气场强、精致' }
export const BODY: Record<Gender, Record<Build, HumanBody>> = {
  female: { short: 'f_petite', regular: 'f_regular', tall: 'f_tall' },
  male: { short: 'm_round', regular: 'm_regular', tall: 'm_tall' },
}

// What Jev chooses among stays agent-studio's four; the others dress the brands' characters (brands.ts) and the
// line-up pass (distinct.ts).
export const OUTFITS: Partial<Record<Outfit, string>> = {
  jacket: '盘扣短褂 + 半身围裙：川湘家常、江湖小馆、火锅、烧烤', tang: '立领唐装 + 长围裙：粤式茶楼、老字号、中式传统菜',
  chef: '双排扣厨师服 + 领巾：西餐、法餐、日料、精致餐厅的主厨', shirt: '衬衫 + 背带围裙：咖啡、甜品、简餐、快餐、新派小店',
}
export const OUTFIT_ZH: Record<Outfit, string> = { jacket: '盘扣短褂配半身围裙', tang: '立领唐装配长围裙', chef: '双排扣厨师服配领巾', shirt: '衬衫配背带围裙', suit: '西装三件套', jumpsuit: '连体工装配条纹袖', polo: 'Polo 衫工服' }

export const HATS: Partial<Record<Hat, string>> = {
  none: '不戴帽：老板/老板娘亲自在前厅招呼客人', toque: '高厨师帽：西式大厨、精致料理', cap: '厨师小帽：后厨师傅、面点、包子',
  bandana: '包头巾：日料、拉面、大排档、烧烤摊',
}
export const HAT_ZH: Record<Hat, string> = { none: '', toque: '高厨师帽', cap: '厨师小帽', bandana: '包头巾', straw: '草帽', visor: '遮阳帽檐', cowboy: '牛仔帽', beret: '贝雷帽' }

export type Personality = 'fiery' | 'calm' | 'refined' | 'honest' | 'cute' | 'bold' | 'shy' | 'pro'
export const PERSONALITY: Record<Personality, string> = {
  fiery: '热情泼辣：嗓门大、直来直去，被质疑立刻回怼',
  calm: '温和笃定：慢条斯理，爱用事实和反问',
  refined: '精致讲究：优雅克制，自视甚高，偶尔戏剧化',
  honest: '憨厚实在：朴实、实诚，量大价低',
  cute: '俏皮可爱：活泼、爱撒娇、爱比心',
  bold: '豪爽大气：江湖气、讲义气、请客不眨眼',
  shy: '文艺腼腆：安静、慢热，一说起菜就两眼放光',
  pro: '严谨专业：讲究火候和食材，像个匠人',
}

// Personality → film-style signature (expr, punch, gesture, act, reaction) and energy, for the rules.
export const STYLE: Record<Personality, [string, string, string, string, string]> = {
  fiery: ['pitch', 'wink', 'hip_one', 'stepIn', 'eyeroll'], calm: ['sly', 'smug', 'wag', 'lean', 'smug'],
  refined: ['proud', 'kiss', 'present', 'none', 'haughty'], honest: ['pitch', 'laugh', 'thumb', 'nod', 'laugh'],
  cute: ['star', 'wink', 'cheer', 'bounce', 'squeal'], bold: ['laugh', 'proud', 'thumb', 'puff', 'laugh'],
  shy: ['think', 'star', 'clasp', 'none', 'nervous'], pro: ['proud', 'smug', 'present', 'nod', 'think'],
}
export const ENERGY: Record<Personality, number> = { fiery: 2.6, cute: 2.4, bold: 2.2, honest: 1.6, pro: 1.4, refined: 1.2, calm: .9, shy: .8 }
export const ENERGY_LEVELS = ['慢条斯理', '平稳', '轻快', '连珠炮']

export const SKINS = ['#F6CBA9', '#F1C09B', '#F7D0B3', '#EBB892']
export const SURNAMES = '陈王李张刘杨黄赵周吴林何郭罗梁'
export const FOREIGN_NAMES: Record<string, [string, string]> = {
  ja: ['由美', '健太'], ko: ['智恩', '敏俊'], en: ['Emma', 'Tom'], it: ['Giulia', 'Marco'], es: ['Lucía', 'Carlos'],
  de: ['Anna', 'Hans'], ru: ['Natasha', 'Ivan'], fr: ['Camille', 'Louis'],
}

// Keyword rules for the accent when Jev is not available (Jev reads each language's `region`).
export const ACCENT_KEYS: Record<string, RegExp> = {
  sc: /川|蜀|重庆|成都|火锅|串串|冒菜|麻辣|钵钵鸡|兔头/gi, yue: /粤|广式|广东|港式|早茶|茶餐厅|烧腊|煲仔|点心|潮汕|顺德|叉烧|茶楼/gi,
  hunan: /湘|湖南|长沙|剁椒|臭豆腐/gi, dongbei: /东北|锅包肉|铁锅炖|哈尔滨|沈阳|酸菜/gi, henan: /河南|豫|烩面|胡辣汤|郑州/gi,
  hubei: /湖北|武汉|热干面|鄂|小龙虾/gi, jiangxi: /江西|赣|南昌|瓦罐|米粉/gi, minnan: /闽|福建|厦门|台湾|沙茶|土笋|泉州/gi,
  shaanxi: /陕西|西安|肉夹馍|泡馍|凉皮|油泼面/gi, shanxi: /山西|晋|刀削面|太原/gi, shandong: /鲁|山东|青岛|煎饼|济南/gi,
  shanghai: /本帮|上海|沪|生煎|小笼|杭帮|江浙|苏帮|淮扬/gi, tianjin: /天津|狗不理|煎饼果子/gi, yunnan: /云南|滇|米线|菌|昆明|傣/gi,
  guizhou: /贵州|黔|酸汤|丝娃娃|贵阳/gi, gansu: /兰州|甘肃|牛肉面/gi, ningxia: /宁夏|清真|手抓羊肉|银川/gi,
  jazh: /日料|日本|寿司|刺身|居酒屋|烧鸟|鮨|和牛|天妇罗|丼|日式/gi, kozh: /韩|朝鲜|部队锅|拌饭|泡菜|韩式/gi,
  enzh: /美式|汉堡|牛排|英式|下午茶|burger|BBQ|炸鱼/gi, itzh: /意大利|意式|披萨|pizza|意面|pasta|提拉米苏/gi,
  eszh: /西班牙|海鲜饭|塔帕斯|墨西哥|taco/gi, dezh: /德国|德式|香肠|啤酒屋|猪肘/gi, ruzh: /俄|罗宋汤|列巴|格鲁吉亚/gi,
  frzh: /法餐|法式|法国|bistro|鹅肝|马卡龙|可颂/gi,
}
