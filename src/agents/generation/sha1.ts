// SHA-1 of UTF-8 text in plain JS. crypto.subtle exists only in secure contexts, and a phone
// opening the dev server over the LAN is not one. Seeds and cache keys only, not security.
export function sha1Hex(text: string) {
  const bytes = new TextEncoder().encode(text)
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000))
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0)
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const w = new Uint32Array(80)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!
      w[i] = (x << 1) | (x >>> 31)
    }
    let [a, b, c, d, e] = h as [number, number, number, number, number]
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const next = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = next
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0; h[4] = (h[4]! + e) >>> 0
  }
  return h.map((word) => word.toString(16).padStart(8, '0')).join('')
}

// The generator's seed: the whole digest as one integer, exactly like int(sha1(name), 16) in Python.
export function nameSeed(name: string) {
  return BigInt('0x' + sha1Hex(name))
}
