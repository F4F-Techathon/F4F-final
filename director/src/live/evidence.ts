import { getEvidence } from '@/data/restaurants'

// What an evidence id stands for. The stage protocol carries ids only; the console reads titles, text and photos
// from the app's own shop data, and an id it does not know (another dataset, a future backend) shows as itself.
const KIND: Record<string, string> = { info: '商家资料', review: '评价', note: '注意事项', dish: '推荐菜', complaint: '差评', deals: '团购', summary: '摘要' }

export interface EvidenceInfo { id: string; kind: string; title: string; text: string; image?: string; /** The title, with its kind in front when the title does not already say it. */ label: string }

export function evidenceInfo(id: string, owner?: string): EvidenceInfo {
  const rest = owner && id.startsWith(`${owner}-`) ? id.slice(owner.length + 1) : id.replace(/^[^-]+-/, '')
  const kind = KIND[rest.split('-')[0] ?? ''] ?? '依据'
  const found = getEvidence([id])[0]
  const title = found?.title ?? rest
  const label = title.includes(kind) || title.includes(kind.slice(0, 2)) ? title : `${kind} · ${title}`
  return { id, kind, title, label, text: found?.text ?? '', ...(found?.images?.[0] ? { image: found.images[0].src } : {}) }
}
