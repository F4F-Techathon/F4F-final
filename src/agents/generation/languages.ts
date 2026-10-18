// The accents a host can speak with (from agent-studio/web/data/catalog.json `languages`):
// `region` is what the accent step reads, `accent` names the foreign language behind a
// 带口音的中文 (it picks a fitting given name when the shop names no owner).
export interface Language { id: string; zh: string; region: string; accent?: string }

export const LANGUAGES: Language[] = [
  { id: 'sc', zh: '四川话', region: '川菜、火锅、串串、冒菜、钵钵鸡（四川、重庆）' },
  { id: 'yue', zh: '粤语', region: '粤菜、早茶、烧腊、港式茶餐厅、煲仔饭、潮汕牛肉火锅（广东、香港）' },
  { id: 'zh', zh: '普通话', region: '京菜、北京烤鸭、淮扬菜、融合菜、连锁快餐（没有明显地域口音）' },
  { id: 'frzh', zh: '法式口音普通话', region: '法餐、法式甜点、法式小馆（法国主厨说中文）', accent: 'fr' },
  { id: 'fr', zh: '法语', region: '法餐（全程说法语）', accent: 'fr' },
  { id: 'dongbei', zh: '东北话', region: '东北菜、锅包肉、铁锅炖、东北烧烤、饺子馆' },
  { id: 'henan', zh: '河南话', region: '豫菜、烩面、胡辣汤、河南小吃' },
  { id: 'hubei', zh: '湖北话', region: '湖北菜、热干面、武汉小吃、小龙虾' },
  { id: 'hunan', zh: '湖南话', region: '湘菜、剁椒鱼头、辣椒炒肉、长沙小吃' },
  { id: 'jiangxi', zh: '江西话', region: '赣菜、江西米粉、瓦罐汤' },
  { id: 'minnan', zh: '闽南话', region: '闽菜、福建菜、沙茶面、土笋冻、台湾菜（福建、台湾）' },
  { id: 'shaanxi', zh: '陕西话', region: '陕西面食、肉夹馍、羊肉泡馍、凉皮、西北菜' },
  { id: 'shanxi', zh: '山西话', region: '山西面食、刀削面、晋菜' },
  { id: 'shandong', zh: '山东话', region: '鲁菜、煎饼、海鲜大排档（山东）' },
  { id: 'shanghai', zh: '上海话', region: '本帮菜、上海菜、杭帮菜、江浙菜、生煎小笼' },
  { id: 'tianjin', zh: '天津话', region: '天津菜、狗不理包子、煎饼果子' },
  { id: 'yunnan', zh: '云南话', region: '云南菜、过桥米线、菌子火锅' },
  { id: 'guizhou', zh: '贵州话', region: '贵州菜、酸汤鱼、丝娃娃' },
  { id: 'gansu', zh: '甘肃话', region: '兰州牛肉面、甘肃菜、西北拉面' },
  { id: 'ningxia', zh: '宁夏话', region: '宁夏菜、清真菜、手抓羊肉' },
  { id: 'jazh', zh: '日式口音普通话', region: '日料、寿司、拉面、居酒屋、烧鸟', accent: 'ja' },
  { id: 'kozh', zh: '韩式口音普通话', region: '韩餐、烤肉、炸鸡、部队锅', accent: 'ko' },
  { id: 'enzh', zh: '英式口音普通话', region: '美式汉堡、牛排馆、西式快餐、英式下午茶、披萨', accent: 'en' },
  { id: 'itzh', zh: '意式口音普通话', region: '意大利菜、披萨、意面、提拉米苏', accent: 'it' },
  { id: 'eszh', zh: '西班牙口音普通话', region: '西班牙菜、海鲜饭、塔帕斯、墨西哥菜', accent: 'es' },
  { id: 'dezh', zh: '德式口音普通话', region: '德国菜、香肠、啤酒屋、猪肘', accent: 'de' },
  { id: 'ruzh', zh: '俄式口音普通话', region: '俄餐、罗宋汤、列巴', accent: 'ru' },
]
