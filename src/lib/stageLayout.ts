// A balanced cast keeps its places throughout the discussion; only the light changes hands.
// Up to six performers: five invited hosts and a guest, or fewer hosts and more guests.
export function stageSlots(count: number) {
  const spread = count <= 2 ? .58 : count === 3 ? .92 : count <= 5 ? 1.04 : 1.1
  const scale = count <= 2 ? .96 : count === 3 ? .86 : count === 4 ? .74 : count === 5 ? .63 : .55
  return Array.from({ length: count }, (_, index) => ({
    offset: count === 1 ? 0 : (index / (count - 1) * 2 - 1) * spread,
    scale,
  }))
}
