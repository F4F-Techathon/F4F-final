// rigkit.js — parametric characters on the film rig's DOM contract.
// Ported from agent-studio/web/js/rigkit.js; it binds onto the renderer exported by
// src/lib/characterRig.js instead of a global window.RIG.
//
// The film's rig.js draws three hand-made characters; its renderer
// (Rig.prototype.render) and director (RIG.Actor) are generic over a spec plus
// a fixed SVG structure (data-k / data-m / data-eye / data-brow / data-fx /
// data-h / data-arm / data-leg). This module emits that same structure from
// interchangeable parts (body template × hair × outfit × hat × accessories ×
// logo badge) and binds it onto the film's own prototype, so every expression,
// gesture, act and viseme of the film works on a generated character unchanged.

import { RIG } from "../../lib/characterRig.js";

export const INK = "#2B1B30", MOUTH = "#5B1F33", TONGUE = "#EE7A86", TEETH = "#FFF8EE", WHITE = "#FFFDF7";
export const f = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------- special bodies */
// a brand's mascot (mascots.js) is not a human template: it registers its own spec and
// drawing here, on the same DOM contract, and specFor / buildSVG hand its looks over to it
const SPECIAL = new Map();
export function registerBody(id, def) {
  SPECIAL.set(id, def);
}
export function specialBody(id) {
  return SPECIAL.get(id) || null;
}

/* ------------------------------------------------------------- catalogue */
export const BODIES = [
  { id: "f_petite", zh: "女 · 娇小", gender: "female", height: "short", lext: 12, W: 78, shoulder: 62, legW: 35, round: false, scale: 0.93 },
  { id: "f_regular", zh: "女 · 标准", gender: "female", height: "regular", lext: 40, W: 86, shoulder: 70, legW: 40, round: false, scale: 1 },
  { id: "f_tall", zh: "女 · 高挑", gender: "female", height: "tall", lext: 70, W: 84, shoulder: 70, legW: 38, round: false, scale: 1.04 },
  { id: "m_round", zh: "男 · 矮壮", gender: "male", height: "short", lext: 16, W: 110, shoulder: 88, legW: 44, round: true, scale: 0.97 },
  { id: "m_regular", zh: "男 · 标准", gender: "male", height: "regular", lext: 40, W: 90, shoulder: 74, legW: 40, round: false, scale: 1 },
  { id: "m_tall", zh: "男 · 高大", gender: "male", height: "tall", lext: 72, W: 96, shoulder: 78, legW: 42, round: false, scale: 1.06 },
];
export const HAIRS = {
  female: [["bun", "高发髻"], ["bob", "齐耳短发"], ["long", "披肩长发"], ["ponytail", "马尾"]],
  male: [["side", "侧分短发"], ["crew", "寸头"], ["curly", "卷发"], ["bald", "光头"], ["clown", "小丑红卷发"]],
};
// The last three outfits and four hats dress the brands' own characters (KFC's colonel, McDonald's clown, the crews
// of the fast-food chains) and give hosts on one stage something other than a white chef's hat.
export const OUTFITS = [["jacket", "盘扣短褂 + 半身围裙"], ["tang", "立领唐装 + 长围裙"], ["chef", "双排扣厨师服 + 领巾"], ["shirt", "衬衫 + 背带围裙"],
  ["suit", "西装三件套"], ["jumpsuit", "连体工装 + 条纹袖"], ["polo", "Polo 衫工服"]];
export const HATS = [["none", "不戴帽"], ["toque", "高厨师帽"], ["cap", "厨师小帽"], ["bandana", "包头巾"], ["straw", "草帽"], ["visor", "遮阳帽檐"], ["cowboy", "牛仔帽"], ["beret", "贝雷帽"]];
// what a host can hold up in the left hand: the brand's signature food
export const PROPS = [["bucket", "全家桶"], ["fries", "薯条"], ["hen", "老母鸡"], ["sub", "长三明治"], ["drumstick", "炸鸡腿"], ["burger", "炸鸡堡"], ["taco", "塔可"], ["pizza", "披萨"], ["bowl", "盖饭"]];
export const SKINS = ["#F6CBA9", "#F1C09B", "#F7D0B3", "#EBB892", "#DDA27C", "#C98E6B"];

/* --------------------------------------------------------------- colour */
function hexRgb(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
export function shade(h, k) {
  const [r, g, b] = hexRgb(h);
  return k < 0 ? rgbHex(r * (1 + k), g * (1 + k), b * (1 + k)) : rgbHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
}
function luma(h) {
  const [r, g, b] = hexRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* ------------------------------------------------------------- spec */
// look (from the agent contract) → the renderer's spec + part choices
export function specFor(look) {
  const special = SPECIAL.get(look.body);
  if (special) return special.spec(look);
  const body = BODIES.find((b) => b.id === look.body) || BODIES[look.gender === "male" ? 4 : 1];
  const male = body.gender === "male";
  const skin = look.skin || SKINS[0];
  const theme = look.theme || "#C9483E";
  const old = look.age === "old";
  // a brand character keeps its own hair colour at any age (the colonel's white, the clown's red)
  const hairColor = look.hairColor && (look.brand || !old) ? look.hairColor : old ? "#B8B2BE" : look.hairColor || "#2A1C24";
  const topColor = look.top || (look.outfit === "chef" ? "#FBF7F0" : theme);
  const sp = {
    skin, skinShade: shade(skin, -0.12), blush: "#EE8C7E", brow: look.hairColor && look.brand ? shade(hairColor, -0.15) : old ? "#6D6670" : look.hairColor || "#2A1C24",
    hair: hairColor, hairHi: shade(hairColor, old && !look.brand ? 0.4 : 0.18),
    top: topColor, topShade: look.outfit === "chef" && !look.top ? "#E6DCCB" : shade(topColor, -0.2),
    inner: "#F6E8D2", trim: "#F3EAD8", second: look.trim || (luma(theme) > 0.6 ? "#3A3540" : "#FFFFFF"),
    apron: look.outfit === "chef" ? "#FFFFFF" : look.outfit === "shirt" ? shade(theme, -0.05) : luma(theme) > 0.6 ? "#3A3540" : "#F3EAD8",
    apronShade: look.outfit === "chef" ? "#E7DFD2" : look.outfit === "shirt" ? shade(theme, -0.25) : luma(theme) > 0.6 ? "#2A2630" : "#DCCFB4",
    accent: look.outfit === "chef" ? theme : look.outfit === "shirt" ? "#FBF7F0" : shade(theme, 0.55),
    pants: look.pants || (look.outfit === "jumpsuit" ? topColor : male ? "#2F3640" : shade(theme, -0.62)), shoes: look.shoes || "#2B2028", bigShoes: look.outfit === "jumpsuit",
    face: male ? { rx: body.round ? 114 : 108, ry: 100, cy: -108 } : { rx: 102, ry: 100, cy: -110 },
    eye: male ? { x: 42, y: -102, rx: 19, ry: 22, lash: false } : { x: 40, y: -104, rx: 21, ry: 25, lash: true },
    browAt: male ? { x: 43, y: -150, w: 21, h: 6, sw: 10 } : { x: 40, y: -150, w: 19, h: 6, sw: 7 },
    mouthAt: { y: male ? -42 : -46, s: male ? 1.08 : 1 },
    cheek: male ? { x: 66, y: -58, rx: 22, ry: 12 } : { x: 62, y: -62, rx: 19, ry: 11 },
    steamY: look.hat === "toque" ? -372 : look.hat === "cowboy" || look.hat === "straw" ? -320 : look.hair === "bun" ? -335 : -282,
    body: body.round ? 1.2 : 1, legW: body.legW, shoulder: body.shoulder, lext: body.lext, W: body.W, round: body.round,
  };
  const hatH = { toque: 340, cap: 270, bandana: 250, straw: 300, visor: 262, cowboy: 312, beret: 276, none: look.hair === "bun" ? 330 : 255 }[look.hat || "none"] || 255;
  const top = Math.min(-610, -(214 + body.lext) - hatH - 24);
  return { sp, body, male, old, theme, scale: body.scale || 1, viewBox: `-210 ${top} 420 ${30 - top}`, vbTop: top, vbH: 30 - top, headOrigin: -(214 + body.lext), headTop: -(214 + body.lext) - hatH };
}

/* ------------------------------------------------------------- helpers */
export function capsule(cx, y, w, h, fill, extra) {
  return '<rect x="' + f(cx - w / 2) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(w / 2) + '" fill="' + fill + '"' + (extra || "") + "/>";
}

/* the film's mouths, eyes and effects — copied verbatim so states render identically. A
   mascot may recolour them (C: stroke, fill, tongue, teeth, lips) and add to one mouth
   (C.extra[name]: 雪王's tongue stays out on his smile) */
const MOUTH_C = { stroke: MOUTH, fill: MOUTH, tongue: TONGUE, teeth: TEETH, lips: "#D96A72" };
export function mouthShape(id, name, d, opts, C) {
  opts = opts || {};
  C = C || MOUTH_C;
  const clip = id + "-mc-" + name;
  const extra = (C.extra && C.extra[name]) || "";
  let s = '<g data-m="' + name + '" opacity="0">';
  if (opts.stroke) {
    s += '<path d="' + d + '" fill="none" stroke="' + C.stroke + '" stroke-width="' + (opts.sw || 6.5) * (C.sw || 1) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    if (opts.dimple) s += '<circle cx="' + opts.dimple[0] + '" cy="' + opts.dimple[1] + '" r="2.6" fill="' + C.stroke + '" opacity=".7"/>';
    return s + extra + "</g>";
  }
  s += '<clipPath id="' + clip + '"><path d="' + d + '"/></clipPath>';
  s += '<path d="' + d + '" fill="' + (opts.fill || C.fill) + '"/>';
  s += '<g clip-path="url(#' + clip + ')">';
  if (opts.teethTop) s += '<rect x="-40" y="' + (opts.teethTop - 40) + '" width="80" height="40" rx="6" fill="' + C.teeth + '"/>';
  if (opts.teethBot) s += '<rect x="-40" y="' + opts.teethBot + '" width="80" height="40" rx="6" fill="' + C.teeth + '"/>';
  if (opts.tongue) s += '<ellipse cx="0" cy="' + opts.tongue[0] + '" rx="' + opts.tongue[1] + '" ry="' + opts.tongue[2] + '" fill="' + C.tongue + '"/>';
  if (opts.line) s += '<path d="' + opts.line + '" stroke="' + C.stroke + '" stroke-width="2" opacity=".5"/>';
  s += "</g>";
  if (opts.lips) s += '<path d="' + d + '" fill="none" stroke="' + opts.lips + '" stroke-width="3"/>';
  return s + extra + "</g>";
}
export function mouthSet(id, colors) {
  const C = colors ? { ...MOUTH_C, ...colors } : MOUTH_C;
  const m = (name, d, opts) => mouthShape(id, name, d, opts, C);
  let rest = "";
  rest += m("smile", "M -22 -4 Q 0 15 22 -4", { stroke: true });
  rest += m("grin", "M -30 -8 Q 0 -3 30 -8 Q 28 25 0 29 Q -28 25 -30 -8 Z", { teethTop: 0, tongue: [26, 17, 11] });
  rest += m("laugh", "M -36 -11 Q 0 -5 36 -11 Q 34 34 0 39 Q -34 34 -36 -11 Z", { teethTop: -1, tongue: [34, 21, 14] });
  rest += m("smirk", "M -20 5 Q 6 11 25 -8", { stroke: true, dimple: [29, -10] });
  rest += m("flat", "M -16 3 L 16 3", { stroke: true });
  rest += m("frown", "M -20 10 Q 0 -6 20 10", { stroke: true });
  rest += m("O", "M 0 -16 C 13 -16 15 -4 15 4 C 15 14 8 20 0 20 C -8 20 -15 14 -15 4 C -15 -4 -13 -16 0 -16 Z", { tongue: [17, 10, 7] });
  rest += m("pout", "M -13 6 Q 0 -5 13 6", { stroke: true, sw: 6 });
  rest += m("wavy", "M -25 4 Q -19 -4 -13 4 Q -7 12 -1 4 Q 5 -4 11 4 Q 17 12 23 4", { stroke: true, sw: 5.5 });
  rest += m("angry", "M -29 -7 L 29 -7 Q 27 17 0 20 Q -27 17 -29 -7 Z", { teethTop: -2, teethBot: 12, line: "M -30 3 L 30 3" });
  rest += m("kiss", "M 0 -8 C 7 -8 9 -3 9 1 C 9 6 5 9 0 9 C -5 9 -9 6 -9 1 C -9 -3 -7 -8 0 -8 Z", { tongue: [8, 4, 3], lips: C.lips });
  let vis = "";
  vis += m("v0", "M -15 2 Q 0 8 15 2", { stroke: true, sw: 6 });
  vis += m("v1", "M -21 -7 Q 0 -11 21 -7 Q 21 22 0 26 Q -21 22 -21 -7 Z", { teethTop: -3, tongue: [24, 14, 9] });
  vis += m("v2", "M 0 -14 C 12 -14 14 -4 14 3 C 14 12 8 17 0 17 C -8 17 -14 12 -14 3 C -14 -4 -12 -14 0 -14 Z", { tongue: [15, 9, 6] });
  vis += m("v3", "M -25 -5 Q 0 -9 25 -5 Q 23 14 0 16 Q -23 14 -25 -5 Z", { teethTop: -1, tongue: [16, 13, 6] });
  vis += m("v4", "M -26 -4 Q 0 -7 26 -4 Q 24 8 0 10 Q -24 8 -26 -4 Z", { teethTop: 0, teethBot: 5 });
  vis += m("v5", "M 0 -9 C 8 -9 10 -3 10 1 C 10 7 6 10 0 10 C -6 10 -10 7 -10 1 C -10 -3 -8 -9 0 -9 Z", { tongue: [9, 5, 3] });
  vis += m("v6", "M -22 -4 Q 0 -7 22 -4 Q 20 8 0 9 Q -20 8 -22 -4 Z", { fill: C.teeth, line: "M -22 2 L 22 2", lips: C.stroke });
  return { rest, vis };
}
// sp.eye may recolour an eye: white (sclera), pupil (+ pupilR), ink (lid line, liner), mode
// (happy / closed / squeeze strokes), lid (the lids' fill — the skin they close with)
export function eyeSVG(id, side, sp) {
  const e = sp.eye, rx = e.rx, ry = e.ry;
  const W = e.white || WHITE, P = e.pupil || INK, K = e.ink || INK, M = e.mode || INK, LID = e.lid || sp.skin;
  const clip = id + "-ec" + side;
  const lidRy = ry * 1.1, lidRx = rx * 1.35;
  const dir = side === "L" ? 1 : -1;
  let s = '<g data-eye="' + side + '" transform="translate(' + (side === "L" ? -e.x : e.x) + " " + e.y + ')">';
  s += '<g data-k="n"><g data-k="scl">';
  s += '<clipPath id="' + clip + '"><ellipse rx="' + rx + '" ry="' + ry + '"/></clipPath>';
  s += '<ellipse rx="' + rx + '" ry="' + ry + '" fill="' + W + '"/>';
  s += '<g clip-path="url(#' + clip + ')">';
  s += '<g data-k="pup"><circle r="' + f(rx * (e.pupilR || 0.66)) + '" fill="' + P + '"/>';
  s += '<circle cx="' + f(-rx * 0.22) + '" cy="' + f(-ry * 0.24) + '" r="' + f(rx * 0.24) + '" fill="#FFFFFF"/>';
  s += '<circle cx="' + f(rx * 0.2) + '" cy="' + f(ry * 0.2) + '" r="' + f(rx * 0.11) + '" fill="#FFFFFF" opacity=".8"/></g>';
  s += '<ellipse data-k="lt" cx="0" cy="' + f(-ry - lidRy) + '" rx="' + f(lidRx) + '" ry="' + f(lidRy) + '" fill="' + LID + '"/>';
  s += '<ellipse data-k="ltl" cx="0" cy="' + f(-ry - lidRy) + '" rx="' + f(lidRx) + '" ry="' + f(lidRy) + '" fill="none" stroke="' + K + '" stroke-width="' + (e.lash ? 6 : 4.5) + '"/>';
  s += '<ellipse data-k="lb" cx="0" cy="' + f(ry + ry * 0.9) + '" rx="' + f(rx * 1.3) + '" ry="' + f(ry * 0.9) + '" fill="' + LID + '"/>';
  s += "</g>";
  s += '<ellipse rx="' + f(rx + 0.6) + '" ry="' + f(ry + 0.6) + '" fill="none" stroke="' + LID + '" stroke-width="3"/>';
  if (e.lash) {
    const ox = -dir * rx;
    s += '<path data-k="wing" d="M ' + f(ox * 0.9) + " " + f(-ry * 0.35) + " Q " + f(ox * 1.25) + " " + f(-ry * 0.55) + " " + f(ox * 1.42) + " " + f(-ry * 0.95) + '" stroke="' + K + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
  }
  s += "</g></g>";
  s += '<path data-k="happy" opacity="0" d="M ' + -rx + " 5 Q 0 " + f(-ry * 1.05) + " " + rx + ' 5" stroke="' + M + '" stroke-width="7.5" fill="none" stroke-linecap="round"/>';
  s += '<path data-k="closed" opacity="0" d="M ' + -rx + " -3 Q 0 " + f(ry * 0.62) + " " + rx + ' -3" stroke="' + M + '" stroke-width="6.5" fill="none" stroke-linecap="round"/>';
  s += '<path data-k="squeeze" opacity="0" d="M ' + f(-dir * rx * 0.8) + " " + f(-ry * 0.55) + " L " + f(dir * rx * 0.55) + " 0 L " + f(-dir * rx * 0.8) + " " + f(ry * 0.55) + '" stroke="' + M + '" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const st = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? rx * 0.48 : rx * 1.12;
    st.push(f(Math.cos(a) * r) + "," + f(Math.sin(a) * r));
  }
  s += '<g data-k="star" opacity="0"><ellipse rx="' + rx + '" ry="' + ry + '" fill="' + W + '"/><polygon points="' + st.join(" ") + '" fill="#F2B632" stroke="#E08A1E" stroke-width="2.5" stroke-linejoin="round"/><circle cx="' + f(-rx * 0.25) + '" cy="' + f(-ry * 0.3) + '" r="3.5" fill="#FFFFFF"/></g>';
  s += "</g>";
  return s;
}
// sp.fxShift[name] = [dx, dy] moves an effect on a mascot's head: the renderer drives the
// effect's own transform, so the offset rides on a wrapper around it
export function fxSVG(id, sp) {
  const at = (k, g) => {
    const v = sp.fxShift && sp.fxShift[k];
    return v ? '<g transform="translate(' + v[0] + " " + v[1] + ')">' + g + "</g>" : g;
  };
  let s = "";
  s += at("sweat", '<g data-fx="sweat" opacity="0" transform="translate(96 -168)"><path d="M 0 -20 Q 15 2 0 13 Q -15 2 0 -20 Z" fill="#9AD6F2"/><ellipse cx="-4" cy="2" rx="3" ry="5" fill="#FFFFFF" opacity=".8"/></g>');
  s += at("anger", '<g data-fx="anger" opacity="0" transform="translate(-92 -176)"><path d="M -18 -6 Q -6 -6 -6 -18 M 6 -18 Q 6 -6 18 -6 M 18 6 Q 6 6 6 18 M -6 18 Q -6 6 -18 6" stroke="#E0453A" stroke-width="6" fill="none" stroke-linecap="round"/></g>');
  const sy = sp.steamY;
  const cloud = (x, k) => '<g data-p="' + k + '"><g transform="translate(' + x + " " + sy + ')"><circle cx="-12" cy="4" r="12" fill="#FFFFFF"/><circle cx="10" cy="2" r="14" fill="#FFFFFF"/><circle cx="0" cy="-9" r="13" fill="#FFFFFF"/><circle cx="2" cy="6" r="11" fill="#F1E9F5"/></g></g>';
  s += at("steam", '<g data-fx="steam" opacity="0">' + cloud(-46, 0) + cloud(48, 1) + cloud(2, 2) + "</g>");
  s += at("excl", '<g data-fx="excl" opacity="0" transform="translate(0 -262)"><rect x="-8" y="-46" width="16" height="34" rx="8" fill="#E0453A"/><circle cy="2" r="8.5" fill="#E0453A"/></g>');
  s += at("quest", '<g data-fx="quest" opacity="0" transform="translate(84 -236)"><path d="M -12 -10 Q -12 -26 2 -26 Q 16 -26 16 -12 Q 16 -2 4 2 L 4 10" stroke="#7A5A9E" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="4" cy="24" r="5.5" fill="#7A5A9E"/></g>');
  s += at("lines", '<g data-fx="lines" opacity="0"><path d="M -78 -68 L -70 -54 M -66 -70 L -58 -56 M -54 -72 L -46 -58 M 50 -72 L 58 -58 M 62 -70 L 70 -56 M 74 -68 L 82 -54" stroke="' + sp.blush + '" stroke-width="4" stroke-linecap="round"/></g>');
  s += at("tears", '<g data-fx="tears" opacity="0"><path d="M -60 -88 Q -52 -74 -60 -66 Q -68 -74 -60 -88 Z" fill="#9AD6F2"/><path d="M 60 -88 Q 68 -74 60 -66 Q 52 -74 60 -88 Z" fill="#9AD6F2"/></g>');
  const sparkle = (x, y, r) => '<path d="M ' + x + " " + (y - r) + " Q " + x + " " + y + " " + (x + r) + " " + y + " Q " + x + " " + y + " " + x + " " + (y + r) + " Q " + x + " " + y + " " + (x - r) + " " + y + " Q " + x + " " + y + " " + x + " " + (y - r) + ' Z" fill="#F2C14E"/>';
  s += at("sparkle", '<g data-fx="sparkle" opacity="0">' + sparkle(-118, -190, 16) + sparkle(122, -150, 12) + sparkle(-96, -40, 10) + sparkle(110, -230, 9) + "</g>");
  return s;
}

/* -------------------------------------------------------------- hair */
function hairBack(sp, look) {
  const F = sp.face, rx = F.rx, top = F.cy - F.ry - 18;
  const hc = sp.hair, hi = sp.hairHi;
  const cap = '<path d="M ' + -(rx + 6) + " " + (F.cy + 10) + " Q " + -(rx + 12) + " " + (top - 4) + " 0 " + (top - 6) + " Q " + (rx + 12) + " " + (top - 4) + " " + (rx + 6) + " " + (F.cy + 10) + " L " + -(rx + 6) + " " + (F.cy + 10) + ' Z" fill="' + hc + '"/>';
  switch (look.hair) {
    case "bun":
      return cap + '<circle cx="8" cy="' + (top - 34) + '" r="54" fill="' + hc + '"/><path d="M -28 ' + (top - 60) + " Q 8 " + (top - 86) + " 44 " + (top - 58) + '" stroke="' + hi + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<line x1="-60" y1="' + (top - 62) + '" x2="72" y2="' + (top - 8) + '" stroke="' + shade(sp.top, 0.25) + '" stroke-width="7" stroke-linecap="round"/><circle cx="-60" cy="' + (top - 62) + '" r="9" fill="' + sp.top + '"/>';
    case "long":
      return '<path d="M ' + -(rx + 10) + " " + (F.cy - 20) + " Q " + -(rx + 16) + " " + (top - 6) + " 0 " + (top - 8) + " Q " + (rx + 16) + " " + (top - 6) + " " + (rx + 10) + " " + (F.cy - 20) + " L " + (rx + 18) + " 46 Q " + (rx * 0.6) + " 62 0 56 Q " + -(rx * 0.6) + " 62 " + -(rx + 18) + ' 46 Z" fill="' + hc + '"/>';
    case "ponytail":
      return cap + '<path d="M ' + (rx - 6) + " " + (top + 40) + " Q " + (rx + 70) + " " + (top + 30) + " " + (rx + 40) + " " + (F.cy + 40) + " Q " + (rx + 18) + " " + (F.cy - 10) + " " + (rx - 10) + " " + (top + 64) + ' Z" fill="' + hc + '"/><circle cx="' + (rx + 2) + '" cy="' + (top + 46) + '" r="9" fill="' + sp.top + '"/>';
    case "bob":
      return '<path d="M ' + -(rx + 10) + " " + (F.cy + 34) + " Q " + -(rx + 16) + " " + (top - 6) + " 0 " + (top - 8) + " Q " + (rx + 16) + " " + (top - 6) + " " + (rx + 10) + " " + (F.cy + 34) + " Q 0 " + (F.cy + 46) + " " + -(rx + 10) + " " + (F.cy + 34) + ' Z" fill="' + hc + '"/>';
    case "curly":
      return cap + [-1, 1].map((s) => '<circle cx="' + s * (rx - 2) + '" cy="' + (F.cy - 18) + '" r="19" fill="' + hc + '"/><circle cx="' + s * (rx + 2) + '" cy="' + (F.cy + 10) + '" r="14" fill="' + hc + '"/>').join("");
    case "bald":
      return [-1, 1].map((s) => '<path d="M ' + s * (rx - 2) + " " + (F.cy - 40) + " Q " + s * (rx + 10) + " " + (F.cy - 10) + " " + s * (rx - 2) + " " + (F.cy + 18) + '" stroke="' + hc + '" stroke-width="16" fill="none" stroke-linecap="round"/>').join("");
    case "clown":
      // two big puffs of curls standing out past the ears, and a crown of them on top
      return cap + [-1, 1].map((s) => [[rx + 18, F.cy - 46, 40], [rx + 34, F.cy - 4, 40], [rx + 22, F.cy + 34, 32], [rx - 14, top + 18, 36]]
        .map(([x, y, r]) => '<circle cx="' + f(s * x) + '" cy="' + f(y) + '" r="' + r + '" fill="' + hc + '"/>').join("") +
        '<path d="M ' + f(s * (rx + 6)) + " " + (F.cy - 70) + " q " + s * 30 + " 14 " + s * 34 + ' 48" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>').join("");
    default:
      return cap;
  }
}
function hairFront(sp, look) {
  const F = sp.face, rx = F.rx, top = F.cy - F.ry - 18;
  const hc = sp.hair, hi = sp.hairHi;
  if (look.hat && look.hat !== "none" && look.hat !== "visor") {
    // under a hat only the fringe at the temples shows
    return [-1, 1].map((s) => '<path d="M ' + s * (rx - 4) + " " + (F.cy - 52) + " Q " + s * (rx + 4) + " " + (F.cy - 20) + " " + s * (rx - 6) + " " + (F.cy - 2) + '" stroke="' + hc + '" stroke-width="12" fill="none" stroke-linecap="round"/>').join("");
  }
  switch (look.hair) {
    case "bun":
    case "ponytail":
      return '<path d="M ' + -(rx + 3) + " " + (F.cy + 10) + " Q " + -(rx + 7) + " " + (top - 2) + " 4 " + (top - 5) + " Q " + (rx + 7) + " " + (top - 2) + " " + (rx + 3) + " " + (F.cy + 10) + " Q " + (rx - 6) + " " + (top + 52) + " " + (rx - 34) + " " + (top + 70) + " Q " + (rx - 28) + " " + (top + 40) + " " + (rx - 48) + " " + (top + 28) + " Q 10 " + (top + 16) + " " + -(rx - 26) + " " + (top + 44) + " Q " + -(rx - 4) + " " + (top + 64) + " " + -(rx + 3) + " " + (F.cy + 10) + ' Z" fill="' + hc + '"/>' +
        '<path d="M -44 ' + (top + 2) + " Q 4 " + (top - 14) + " 52 " + (top + 4) + '" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>';
    case "bob":
    case "long":
      return '<path d="M ' + -(rx + 4) + " " + (F.cy + 6) + " Q " + -(rx + 8) + " " + (top - 4) + " 0 " + (top - 6) + " Q " + (rx + 8) + " " + (top - 4) + " " + (rx + 4) + " " + (F.cy + 6) + " L " + (rx - 8) + " " + (F.cy - 36) + " Q " + (rx * 0.4) + " " + (top + 54) + " 0 " + (top + 50) + " Q " + -(rx * 0.5) + " " + (top + 58) + " " + -(rx - 8) + " " + (F.cy - 36) + ' Z" fill="' + hc + '"/>' +
        '<path d="M -50 ' + (top + 4) + " Q 0 " + (top - 12) + " 50 " + (top + 4) + '" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>';
    case "side":
      return '<path d="M ' + -(rx + 1) + " " + (F.cy - 2) + " Q " + -(rx + 9) + " " + (top - 8) + " 0 " + (top - 10) + " Q " + (rx + 9) + " " + (top - 8) + " " + (rx + 1) + " " + (F.cy - 2) + " Q " + (rx - 6) + " " + (top + 44) + " " + (rx - 16) + " " + (top + 58) + " Q " + (rx - 52) + " " + (top + 40) + " 20 " + (top + 60) + " Q -30 " + (top + 30) + " " + -(rx - 30) + " " + (top + 48) + " Q " + -(rx - 6) + " " + (top + 64) + " " + -(rx + 1) + " " + (F.cy - 2) + ' Z" fill="' + hc + '"/>' +
        (look.age === "middle" ? '<path d="M ' + -(rx + 1) + " " + (F.cy - 2) + " Q " + -(rx + 6) + " " + (top + 30) + " " + -(rx - 22) + " " + (top + 6) + " Q " + -(rx - 14) + " " + (top + 40) + " " + -(rx + 1) + ' ' + (F.cy - 2) + ' Z" fill="#C2BCC8"/>' : "") +
        '<path d="M -70 ' + (top + 2) + " Q -20 " + (top - 12) + " 40 " + (top + 2) + '" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/>';
    case "crew":
      return '<path d="M ' + -(rx - 2) + " " + (F.cy - 30) + " Q " + -(rx + 2) + " " + (top + 4) + " 0 " + (top + 2) + " Q " + (rx + 2) + " " + (top + 4) + " " + (rx - 2) + " " + (F.cy - 30) + " Q " + (rx - 14) + " " + (top + 34) + " 0 " + (top + 30) + " Q " + -(rx - 14) + " " + (top + 34) + " " + -(rx - 2) + " " + (F.cy - 30) + ' Z" fill="' + hc + '" opacity=".95"/>';
    case "clown":
    case "curly": {
      let s = "";
      for (let i = 0; i < 7; i += 1) {
        const x = -rx * 0.78 + (i * rx * 1.56) / 6;
        s += '<circle cx="' + f(x) + '" cy="' + f(top + 18 + Math.abs(i - 3) * 6) + '" r="' + (24 - Math.abs(i - 3) * 2) + '" fill="' + hc + '"/>';
      }
      return s;
    }
    case "bald":
      return '<ellipse cx="-30" cy="' + (top + 30) + '" rx="22" ry="10" fill="#FFFFFF" opacity=".35"/>';
    default:
      return "";
  }
}
function hatSVG(sp, look) {
  const F = sp.face, rx = F.rx, top = F.cy - F.ry - 18;
  switch (look.hat) {
    case "toque":
      return '<rect x="' + -(rx - 4) + '" y="' + (top - 48) + '" width="' + (2 * rx - 8) + '" height="56" fill="#FFFFFF"/>' +
        '<circle cx="-58" cy="' + (top - 50) + '" r="52" fill="#FFFFFF"/><circle cx="58" cy="' + (top - 50) + '" r="52" fill="#FFFFFF"/><circle cx="0" cy="' + (top - 78) + '" r="60" fill="#FFFFFF"/>' +
        '<path d="M -40 ' + (top - 88) + " L -44 " + (top - 10) + " M 0 " + (top - 118) + " L 0 " + (top - 10) + " M 40 " + (top - 88) + " L 44 " + (top - 10) + '" stroke="#EAE3D7" stroke-width="5" stroke-linecap="round"/>' +
        '<rect x="' + -(rx - 6) + '" y="' + (top - 12) + '" width="' + (2 * rx - 12) + '" height="42" rx="12" fill="#FFFFFF"/><rect x="' + -(rx - 6) + '" y="' + (top + 22) + '" width="' + (2 * rx - 12) + '" height="8" rx="4" fill="#ECE5DA"/>';
    case "cap":
      return '<path d="M ' + -(rx + 2) + " " + (top + 34) + " L " + -(rx - 14) + " " + (top - 30) + " Q 0 " + (top - 44) + " " + (rx - 14) + " " + (top - 30) + " L " + (rx + 2) + " " + (top + 34) + ' Z" fill="#FFFFFF"/>' +
        '<rect x="' + -(rx + 4) + '" y="' + (top + 24) + '" width="' + (2 * rx + 8) + '" height="16" rx="8" fill="' + sp.accent + '"/>';
    case "bandana":
      return '<path d="M ' + -(rx + 4) + " " + (top + 40) + " Q " + -(rx + 10) + " " + (top - 22) + " 0 " + (top - 24) + " Q " + (rx + 10) + " " + (top - 22) + " " + (rx + 4) + " " + (top + 40) + " Q 0 " + (top + 22) + " " + -(rx + 4) + " " + (top + 40) + ' Z" fill="' + sp.top + '"/>' +
        '<path d="M ' + (rx - 4) + " " + (top + 26) + " q 34 -6 40 18 q -22 -2 -30 8 z" + '" fill="' + sp.topShade + '"/><circle cx="-30" cy="' + (top + 2) + '" r="6" fill="' + shade(sp.top, 0.5) + '"/><circle cx="20" cy="' + (top - 6) + '" r="6" fill="' + shade(sp.top, 0.5) + '"/>';
    case "straw": {
      // a farmer's straw hat: a wide brim, a round crown, a band in the shirt's colour
      const straw = "#E6BE62", strawDark = "#C99A3E";
      let s = '<ellipse cx="0" cy="' + (top + 34) + '" rx="' + (rx + 62) + '" ry="30" fill="' + straw + '"/>';
      s += '<ellipse cx="0" cy="' + (top + 40) + '" rx="' + (rx + 50) + '" ry="20" fill="' + strawDark + '" opacity=".45"/>';
      s += '<path d="M ' + -(rx - 6) + " " + (top + 34) + " Q " + -(rx - 2) + " " + (top - 54) + " 0 " + (top - 58) + " Q " + (rx - 2) + " " + (top - 54) + " " + (rx - 6) + " " + (top + 34) + ' Z" fill="' + straw + '"/>';
      s += '<path d="M ' + -(rx - 4) + " " + (top + 14) + " Q 0 " + (top + 26) + " " + (rx - 4) + " " + (top + 14) + " L " + (rx - 5) + " " + (top + 32) + " Q 0 " + (top + 44) + " " + -(rx - 5) + " " + (top + 32) + ' Z" fill="' + (look.trim || shade(sp.top, -0.1)) + '"/>';
      for (let i = -3; i <= 3; i += 1) s += '<path d="M ' + i * 24 + " " + (top - 50 + Math.abs(i) * 6) + " Q " + (i * 26) + " " + (top - 10) + " " + i * 27 + " " + (top + 12) + '" stroke="' + strawDark + '" stroke-width="3" fill="none" opacity=".55"/>';
      return s;
    }
    case "visor":
      // a crew visor: a band over the hair and a peak over the eyes
      return '<path d="M ' + -(rx + 6) + " " + (top + 44) + " Q 0 " + (top + 22) + " " + (rx + 6) + " " + (top + 44) + " L " + (rx + 4) + " " + (top + 66) + " Q 0 " + (top + 46) + " " + -(rx + 4) + " " + (top + 66) + ' Z" fill="' + sp.top + '"/>' +
        '<path d="M ' + -(rx - 10) + " " + (top + 62) + " Q 0 " + (top + 44) + " " + (rx - 10) + " " + (top + 62) + " Q " + (rx - 30) + " " + (top + 92) + " 0 " + (top + 94) + " Q " + -(rx - 30) + " " + (top + 92) + " " + -(rx - 10) + " " + (top + 62) + ' Z" fill="' + sp.topShade + '"/>' +
        '<path d="M ' + -(rx - 4) + " " + (top + 44) + " Q 0 " + (top + 26) + " " + (rx - 4) + " " + (top + 44) + '" stroke="' + sp.second + '" stroke-width="5" fill="none"/>';
    case "cowboy": {
      // a cowboy hat: brim curled up at both sides, a pinched crown, a band
      const felt = "#8A5530", dark = shade(felt, -0.25);
      return '<path d="M ' + -(rx + 58) + " " + (top + 4) + " Q " + -(rx + 40) + " " + (top + 44) + " 0 " + (top + 46) + " Q " + (rx + 40) + " " + (top + 44) + " " + (rx + 58) + " " + (top + 4) + " Q " + (rx + 30) + " " + (top + 26) + " 0 " + (top + 24) + " Q " + -(rx + 30) + " " + (top + 26) + " " + -(rx + 58) + " " + (top + 4) + ' Z" fill="' + felt + '"/>' +
        '<path d="M ' + -(rx - 12) + " " + (top + 28) + " Q " + -(rx - 4) + " " + (top - 62) + " " + -24 + " " + (top - 66) + " Q 0 " + (top - 48) + " 24 " + (top - 66) + " Q " + (rx - 4) + " " + (top - 62) + " " + (rx - 12) + " " + (top + 28) + ' Z" fill="' + felt + '"/>' +
        '<path d="M ' + -(rx - 12) + " " + (top + 6) + " Q 0 " + (top + 16) + " " + (rx - 12) + " " + (top + 6) + " L " + (rx - 12) + " " + (top + 24) + " Q 0 " + (top + 34) + " " + -(rx - 12) + " " + (top + 24) + ' Z" fill="' + dark + '"/>' +
        '<path d="M -10 ' + (top - 52) + " Q 0 " + (top - 30) + " 10 " + (top - 52) + '" stroke="' + dark + '" stroke-width="4" fill="none"/>';
    }
    case "beret":
      return '<path d="M ' + -(rx + 10) + " " + (top + 30) + " Q " + -(rx + 18) + " " + (top - 30) + " " + -10 + " " + (top - 40) + " Q " + (rx + 30) + " " + (top - 44) + " " + (rx + 22) + " " + (top + 6) + " Q " + (rx * 0.3) + " " + (top + 12) + " " + -(rx + 10) + " " + (top + 30) + ' Z" fill="' + sp.top + '"/>' +
        '<path d="M ' + -(rx + 6) + " " + (top + 24) + " Q " + (rx * 0.2) + " " + (top + 6) + " " + (rx + 18) + " " + (top + 2) + '" stroke="' + sp.topShade + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<rect x="-4" y="' + (top - 56) + '" width="8" height="18" rx="4" fill="' + sp.topShade + '"/>';
    default:
      return "";
  }
}

/* ------------------------------------------------------------- bodies */
function torsoPath(W, bottom) {
  return "M " + f(-W * 0.77) + " -210 Q " + f(-W * 0.98) + " -206 " + f(-W) + " -186 L " + f(-W * 1.05) + " -104 Q " + f(-W * 1.05) + " " + f(bottom - 2) + " " + f(-W * 0.82) + " " + bottom +
    " L " + f(W * 0.82) + " " + bottom + " Q " + f(W * 1.05) + " " + f(bottom - 2) + " " + f(W * 1.05) + " -104 L " + W + " -186 Q " + f(W * 0.98) + " -206 " + f(W * 0.77) + " -210 Z";
}
function torsoSVG(sp, look) {
  const W = sp.W, bot = sp.round ? -70 : -84;
  let s = '<path d="' + torsoPath(W, bot) + '" fill="' + sp.top + '"/>';
  s += '<path d="M ' + f(W * 0.67) + " -206 Q " + W + " -204 " + f(W * 1.02) + " -186 L " + f(W * 1.05) + " -104 Q " + f(W * 1.05) + " " + (bot - 6) + " " + f(W * 0.9) + " " + (bot - 2) + " L " + f(W * 0.8) + " " + (bot - 2) + " Q " + f(W * 0.86) + " -150 " + f(W * 0.67) + ' -206 Z" fill="' + sp.topShade + '" opacity=".55"/>';
  const btn = (x, y) => '<rect x="' + (x - 14) + '" y="' + y + '" width="28" height="7" rx="3.5" fill="' + sp.trim + '"/><circle cx="' + (x + 15) + '" cy="' + (y + 3.5) + '" r="4.5" fill="' + sp.trim + '"/>';
  switch (look.outfit) {
    case "jacket":
      s += '<path d="M -24 -212 L 0 -170 L 24 -212 Z" fill="' + sp.inner + '"/><path d="M -29 -219 Q 0 -207 29 -219 L 31 -206 Q 0 -194 -31 -206 Z" fill="' + sp.topShade + '"/>';
      [-188, -168, -148].forEach((y) => (s += btn(-3, y)));
      s += '<path d="M ' + f(-W * 0.87) + " -130 L " + f(W * 0.87) + " -130 L " + f(W * 0.94) + " -42 Q 0 -33 " + f(-W * 0.94) + ' -42 Z" fill="' + sp.apron + '"/>';
      s += '<rect x="' + f(-W * 0.93) + '" y="-136" width="' + f(W * 1.86) + '" height="12" rx="6" fill="' + sp.apronShade + '"/>';
      s += '<rect x="' + f(-W * 0.56) + '" y="-106" width="42" height="34" rx="6" fill="' + sp.apronShade + '"/>';
      break;
    case "tang":
      s += '<path d="M -29 -220 Q 0 -208 29 -220 L 31 -205 Q 0 -193 -31 -205 Z" fill="' + sp.trim + '"/><path d="M 2 -200 Q 8 -160 6 -122" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
      [-186, -165, -144].forEach((y) => (s += btn(5, y)));
      s += '<path d="M ' + f(-W * 0.86) + " -124 L " + f(W * 0.86) + " -124 L " + f(W * 0.92) + " -28 Q 0 -17 " + f(-W * 0.92) + ' -28 Z" fill="' + sp.apron + '"/>';
      s += '<rect x="' + f(-W * 0.9) + '" y="-130" width="' + f(W * 1.8) + '" height="12" rx="6" fill="' + sp.apronShade + '"/>';
      s += '<rect x="14" y="-104" width="46" height="38" rx="8" fill="' + sp.top + '"/>';
      break;
    case "chef":
      s += '<path d="M 10 -204 Q 15 -150 10 -96" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
      [-182, -158, -134].forEach((y) => (s += '<circle cx="-22" cy="' + y + '" r="5.5" fill="#3B2A44"/><circle cx="32" cy="' + y + '" r="5.5" fill="#3B2A44"/>'));
      s += '<path d="M ' + f(-W * 0.88) + " -122 L " + f(W * 0.88) + " -122 L " + f(W * 0.95) + " -38 Q 0 -30 " + f(-W * 0.95) + ' -38 Z" fill="' + sp.apron + '"/>';
      s += '<rect x="' + f(-W * 0.93) + '" y="-128" width="' + f(W * 1.86) + '" height="11" rx="5.5" fill="' + sp.apronShade + '"/>';
      s += '<path d="M -35 -221 Q 0 -201 35 -221 L 31 -204 Q 0 -186 -31 -204 Z" fill="' + sp.accent + '"/><path d="M -7 -201 L 7 -201 L 20 -164 L 0 -175 L -20 -164 Z" fill="' + sp.accent + '"/><path d="M 0 -175 L 20 -164 L 7 -201 Z" fill="' + shade(sp.accent, -0.2) + '"/>';
      break;
    case "suit": {
      // a three-piece suit: a shirt and waistcoat in the V of the lapels, two buttons, pocket flaps
      const lapel = shade(sp.top, -0.12);
      s += '<path d="M -30 -214 L 0 -150 L 30 -214 Z" fill="#FFFFFF"/>';
      s += '<path d="M -22 -186 L 0 -146 L 22 -186 L 26 -120 L -26 -120 Z" fill="' + shade(sp.top, -0.06) + '"/>';
      s += '<path d="M -34 -218 L -46 -200 L -30 -176 L -38 -166 L -4 -122 L -22 -196 Z M 34 -218 L 46 -200 L 30 -176 L 38 -166 L 4 -122 L 22 -196 Z" fill="' + lapel + '"/>';
      [-112, -96].forEach((y) => (s += '<circle cx="0" cy="' + y + '" r="5" fill="' + shade(sp.top, -0.35) + '"/>'));
      s += '<path d="M ' + f(-W * 0.86) + " -112 L " + f(-W * 0.42) + ' -112 M ' + f(W * 0.42) + " -112 L " + f(W * 0.86) + ' -112" stroke="' + lapel + '" stroke-width="5" stroke-linecap="round"/>';
      break;
    }
    case "jumpsuit":
      // a one-piece in the brand colour: a zip, a belt and a chest pocket in the second colour
      s += '<path d="M -26 -214 Q 0 -196 26 -214 L 22 -200 Q 0 -186 -22 -200 Z" fill="' + sp.second + '"/>';
      s += '<path d="M 0 -198 L 0 -100" stroke="' + sp.topShade + '" stroke-width="4"/>';
      s += '<rect x="' + f(-W * 0.98) + '" y="-112" width="' + f(W * 1.96) + '" height="16" rx="8" fill="' + sp.second + '"/><rect x="-14" y="-115" width="28" height="22" rx="5" fill="' + shade(sp.top, 0.35) + '"/>';
      s += '<rect x="' + f(W * 0.18) + '" y="-190" width="' + f(W * 0.5) + '" height="40" rx="7" fill="' + sp.second + '"/>';
      break;
    case "polo":
      // a crew polo: a soft collar, a three-button placket, a contrast hem
      s += '<path d="M -36 -216 L -4 -196 L -14 -172 L -46 -196 Z M 36 -216 L 4 -196 L 14 -172 L 46 -196 Z" fill="' + sp.second + '"/>';
      s += '<rect x="-7" y="-198" width="14" height="52" rx="4" fill="' + sp.topShade + '"/>';
      [-188, -172, -156].forEach((y) => (s += '<circle cx="0" cy="' + y + '" r="3.6" fill="' + sp.second + '"/>'));
      s += '<rect x="' + f(-W * 1.02) + '" y="' + (bot - 24) + '" width="' + f(W * 2.04) + '" height="12" rx="6" fill="' + sp.second + '" opacity=".9"/>';
      break;
    default: // shirt + bib apron
      s += '<path d="M -26 -214 L -6 -192 L -16 -184 Z M 26 -214 L 6 -192 L 16 -184 Z" fill="' + sp.inner + '"/>';
      s += '<path d="M ' + f(-W * 0.5) + " -196 L " + f(W * 0.5) + " -196 L " + f(W * 0.56) + " -150 L " + f(W * 0.88) + " -128 L " + f(W * 0.94) + " -38 Q 0 -30 " + f(-W * 0.94) + " -38 L " + f(-W * 0.88) + " -128 L " + f(-W * 0.56) + ' -150 Z" fill="' + sp.apron + '"/>';
      s += '<path d="M ' + f(-W * 0.5) + " -196 L " + f(-W * 0.62) + " -214 M " + f(W * 0.5) + " -196 L " + f(W * 0.62) + ' -214" stroke="' + sp.apronShade + '" stroke-width="7" stroke-linecap="round"/>';
      s += '<rect x="' + f(-W * 0.3) + '" y="-112" width="' + f(W * 0.6) + '" height="36" rx="8" fill="' + sp.apronShade + '"/>';
  }
  return s;
}
// The shop's own picture on the chest: its cover photo (or logo), cropped round in a ring of its colour; a mascot
// pins the same badge wherever its costume has room (mascots.js).
export function badgeAt(id, look, x, y, r, ring) {
  const color = ring || look.theme || "#C9483E";
  let s = '<g data-k="badge" transform="translate(' + f(x) + " " + f(y) + ')">';
  s += '<circle r="' + (r + 4) + '" fill="' + shade(color, -0.35) + '"/><circle r="' + r + '" fill="#FFFFFF"/>';
  if (look.logo) {
    s += '<clipPath id="' + id + '-badge"><circle r="' + (r - 4) + '"/></clipPath>';
    s += '<image href="' + esc(look.logo) + '" x="' + -(r - 4) + '" y="' + -(r - 4) + '" width="' + 2 * (r - 4) + '" height="' + 2 * (r - 4) + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + '-badge)"/>';
  } else {
    s += '<circle r="' + (r - 4) + '" fill="' + color + '"/><text y="' + f(r * 0.33) + '" text-anchor="middle" font-size="' + f(r * 0.95) + '" font-weight="700" font-family="Noto Sans SC, sans-serif" fill="#FFFFFF">' + esc((look.badgeText || "店").slice(0, 1)) + "</text>";
  }
  s += '<circle r="' + r + '" fill="none" stroke="' + color + '" stroke-width="3.5"/></g>';
  return s;
}
function badgeSVG(id, sp, look) {
  // as large as the chest allows between the collar and the apron's waistband
  return badgeAt(id, look, -sp.W * 0.44, look.outfit === "shirt" ? -164 : -166, 36, look.theme || sp.top);
}
// a bow tie at the collar, or with a suit the colonel's string tie; drawn over the badge
function tieSVG(sp, look) {
  let s = "";
  if ((look.accessories || []).includes("bowtie")) {
    const tie = look.outfit === "suit" ? "#1F1A20" : sp.second === "#FFFFFF" ? "#2B1B30" : sp.second;
    s += look.outfit === "suit"
      ? '<path d="M 0 -206 L -24 -218 L -24 -194 Z M 0 -206 L 24 -218 L 24 -194 Z" fill="' + tie + '"/><circle cx="0" cy="-206" r="6" fill="' + tie + '"/><path d="M -3 -204 Q -8 -186 -12 -166 M 3 -204 Q 8 -186 12 -166" stroke="' + tie + '" stroke-width="4" fill="none" stroke-linecap="round"/>'
      : '<path d="M 0 -208 L -22 -220 L -22 -196 Z M 0 -208 L 22 -220 L 22 -196 Z" fill="' + tie + '"/><circle cx="0" cy="-208" r="6" fill="' + shade(tie, -0.2) + '"/>';
  }
  return s;
}
function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function armSVG(sp, look, side, id) {
  const long = look.outfit === "chef" || look.outfit === "shirt" || look.outfit === "suit" || look.outfit === "jumpsuit";
  const sleeve = sp.top;
  let forearm = long ? capsule(0, -6, 29, 58, look.outfit === "shirt" ? sp.inner : sleeve) + capsule(0, 34, 31, 14, look.outfit === "suit" ? "#FFFFFF" : sp.topShade) : capsule(0, -6, 27, 62, sp.skin);
  let upper = capsule(0, -10, sp.round ? 36 : 34, 72, look.outfit === "shirt" ? sp.inner : sleeve);
  if (look.outfit === "tang") upper += capsule(0, 44, 36, 14, sp.trim);
  if (look.outfit === "jacket") forearm += capsule(0, -8, 33, 16, sp.topShade);
  if (look.outfit === "polo") upper = capsule(0, -10, sp.round ? 38 : 36, 56, sleeve) + capsule(0, 34, sp.round ? 38 : 36, 10, sp.second);
  if (look.outfit === "jumpsuit") {
    // the clown's striped sleeves: bands of the second colour down the arm
    [6, 30].forEach((y) => (upper += '<rect x="' + -(sp.round ? 18 : 17) + '" y="' + y + '" width="' + (sp.round ? 36 : 34) + '" height="12" fill="' + sp.second + '"/>'));
    [4, 24].forEach((y) => (forearm += '<rect x="-14.5" y="' + y + '" width="29" height="10" fill="' + sp.second + '"/>'));
  }
  const hand = '<g data-k="hand">' +
    '<g data-h="open"><circle r="18" fill="' + sp.skin + '"/><ellipse cx="' + (side === "L" ? 13 : -13) + '" cy="-6" rx="7" ry="9" fill="' + sp.skin + '"/></g>' +
    '<g data-h="fist" opacity="0"><circle r="16" fill="' + sp.skin + '"/><path d="M -9 -4 L 9 -4 M -9 3 L 9 3" stroke="' + sp.skinShade + '" stroke-width="2.5" stroke-linecap="round"/></g>' +
    '<g data-h="thumb" opacity="0"><circle r="16" fill="' + sp.skin + '"/>' + capsule(side === "L" ? 7 : -7, 2, 12, 32, sp.skin) + '<path d="M -9 2 L 9 2 M -9 9 L 9 9" stroke="' + sp.skinShade + '" stroke-width="2.5" stroke-linecap="round"/></g>' +
    '<g data-h="point" opacity="0"><circle r="16" fill="' + sp.skin + '"/>' + capsule(0, 6, 11, 34, sp.skin) + "</g></g>";
  const held = side === "L" && look.prop ? propSVG(look.prop, sp, id) : "";
  return '<g data-arm="' + side + '">' + upper + '<g data-k="elbow">' + forearm + '<g data-k="handpos">' + held + hand + "</g></g></g>";
}

// A brand's signature food in the left hand, kept upright whatever the arm does ([data-prop], see createKitRig).
// Drawn round the hand at the origin: the hand grips its lower part.
function propSVG(kind, sp, id) {
  const ink = ' stroke="#3B2A2A" stroke-width="3" stroke-linejoin="round"';
  let g = "";
  switch (kind) {
    case "bucket": {
      // a striped bucket of chicken
      g += '<clipPath id="' + id + '-bucket"><path d="M -40 -84 L 40 -84 L 31 4 L -31 4 Z"/></clipPath>';
      g += '<circle cx="-18" cy="-92" r="15" fill="#C8782E"' + ink + '/><circle cx="6" cy="-98" r="16" fill="#D88A38"' + ink + '/><circle cx="26" cy="-90" r="13" fill="#C8782E"' + ink + "/>";
      g += '<path d="M -40 -84 L 40 -84 L 31 4 L -31 4 Z" fill="#FFFFFF"/>';
      g += '<g clip-path="url(#' + id + '-bucket)">' + [-34, -14, 6, 26].map((x) => '<rect x="' + x + '" y="-90" width="10" height="100" fill="' + sp.second + '"/>').join("") + "</g>";
      g += '<path d="M -40 -84 L 40 -84 L 31 4 L -31 4 Z" fill="none"' + ink + '/><rect x="-44" y="-90" width="88" height="12" rx="5" fill="#FFFFFF"' + ink + "/>";
      break;
    }
    case "fries":
      g += [-16, -6, 4, 14, -11, 9].map((x, i) => '<rect x="' + x + '" y="' + (-96 + (i % 3) * 7) + '" width="8" height="54" rx="3" fill="#F6C443"' + ink.replace("3", "2") + "/>").join("");
      g += '<path d="M -28 -52 Q 0 -40 28 -52 L 22 4 L -22 4 Z" fill="' + sp.second + '"' + ink + '/><path d="M -10 -30 Q -5 -42 0 -30 Q 5 -42 10 -30" stroke="#F6C443" stroke-width="5" fill="none" stroke-linecap="round"/>';
      break;
    case "hen":
      // a plump white hen with a red comb, held up in front
      g += '<ellipse cx="0" cy="-40" rx="44" ry="34" fill="#FFFFFF"' + ink + '/><path d="M -40 -50 Q -64 -78 -50 -34 Z" fill="#F3EEE6"' + ink + "/>";
      g += '<circle cx="30" cy="-74" r="20" fill="#FFFFFF"' + ink + '/><path d="M 22 -92 q 4 -14 10 -2 q 6 -12 10 2 q 2 6 -6 6 z" fill="#E0453A"' + ink.replace("3", "2") + "/>";
      g += '<path d="M 48 -74 L 62 -70 L 48 -66 Z" fill="#F2A33A"' + ink.replace("3", "2") + '/><circle cx="36" cy="-78" r="3.5" fill="#2B1B30"/><path d="M 44 -62 q 6 6 0 12 q -6 -4 0 -12 z" fill="#E0453A"/>';
      g += '<path d="M -18 -36 Q 0 -20 18 -36" stroke="#D9D2C6" stroke-width="5" fill="none" stroke-linecap="round"/>';
      break;
    case "sub":
      // a footlong held level
      g += '<rect x="-70" y="-46" width="140" height="34" rx="17" fill="#E2A957"' + ink + '/><path d="M -64 -28 Q -48 -18 -32 -28 Q -16 -18 0 -28 Q 16 -18 32 -28 Q 48 -18 64 -28" stroke="#6DBE45" stroke-width="7" fill="none" stroke-linecap="round"/>';
      g += [-44, -10, 24].map((x) => '<ellipse cx="' + x + '" cy="-22" rx="12" ry="5" fill="#E0453A"/>').join("") + '<path d="M -58 -40 Q 0 -54 58 -40" stroke="#F3CC85" stroke-width="5" fill="none" stroke-linecap="round"/>';
      break;
    case "drumstick":
      g += '<rect x="-6" y="-30" width="12" height="40" rx="6" fill="#FFF4E0"' + ink + '/><circle cx="-7" cy="10" r="8" fill="#FFF4E0"' + ink + '/><circle cx="7" cy="10" r="8" fill="#FFF4E0"' + ink + "/>";
      g += '<path d="M 0 -104 Q 34 -100 30 -60 Q 26 -30 0 -26 Q -26 -30 -30 -60 Q -34 -100 0 -104 Z" fill="#C8782E"' + ink + '/><path d="M -14 -84 l 6 4 M 8 -90 l 6 4 M -4 -64 l 6 4 M 14 -60 l 5 4" stroke="#8C4F1C" stroke-width="4" stroke-linecap="round"/>';
      break;
    case "burger":
      g += '<path d="M -40 -50 Q -40 -92 0 -92 Q 40 -92 40 -50 Z" fill="#E2A957"' + ink + '/><path d="M -20 -78 l 4 -3 M 0 -84 l 4 -3 M 18 -76 l 4 -3" stroke="#FFF3D6" stroke-width="3" stroke-linecap="round"/>';
      g += '<path d="M -46 -44 Q -30 -54 -14 -44 Q 0 -54 14 -44 Q 30 -54 46 -44 L 44 -32 L -44 -32 Z" fill="#C8782E"' + ink + '/><path d="M -44 -36 Q -22 -26 0 -36 Q 22 -26 44 -36" stroke="#6DBE45" stroke-width="6" fill="none" stroke-linecap="round"/>';
      g += '<path d="M -40 -30 L 40 -30 Q 40 -6 0 -6 Q -40 -6 -40 -30 Z" fill="#D9A04E"' + ink + "/>";
      break;
    case "taco":
      g += '<path d="M -48 -20 Q -48 -84 0 -84 Q 48 -84 48 -20 Z" fill="#F2C14E"' + ink + '/><path d="M -38 -30 Q -36 -70 0 -72 Q 36 -70 38 -30" stroke="#6DBE45" stroke-width="10" fill="none" stroke-linecap="round"/>';
      g += [-20, 0, 20].map((x) => '<circle cx="' + x + '" cy="' + (-60 + Math.abs(x) * 0.4) + '" r="6" fill="#E0453A"/>').join("") + '<path d="M -48 -20 Q -48 -84 0 -84 Q 48 -84 48 -20" fill="none"' + ink + "/>";
      break;
    case "pizza":
      g += '<path d="M -40 -96 Q 0 -110 40 -96 L 0 8 Z" fill="#F4C55A"' + ink + '/><path d="M -40 -96 Q 0 -110 40 -96 L 36 -86 Q 0 -98 -36 -86 Z" fill="#C98A3E"/>';
      g += [[-14, -76], [12, -70], [-2, -46], [6, -24]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="7" fill="#C8352B"/>').join("") + '<path d="M -40 -96 Q 0 -110 40 -96 L 0 8 Z" fill="none"' + ink + "/>";
      break;
    case "bowl":
      g += '<path d="M -34 -78 L -24 -112 M -24 -78 L -10 -110" stroke="#B5794A" stroke-width="5" stroke-linecap="round"/>';
      g += '<ellipse cx="0" cy="-58" rx="46" ry="14" fill="#FFFFFF"' + ink + '/><path d="M -40 -62 Q -30 -86 0 -84 Q 30 -86 40 -62 Z" fill="#B5652E"/>';
      g += '<path d="M -46 -58 Q -44 -8 0 -6 Q 44 -8 46 -58 Z" fill="' + sp.second + '"' + ink + '/><path d="M -30 -40 Q 0 -30 30 -40" stroke="#FFFFFF" stroke-width="4" fill="none" opacity=".7"/>';
      break;
    default:
      return "";
  }
  return '<g data-prop="0">' + g + "</g>";
}
function legSVG(sp, side) {
  const w = sp.legW, L = sp.lext;
  // the clown's oversized shoes point outwards
  const big = sp.bigShoes ? 22 : 0, out = side === "L" ? -big : big;
  return '<g data-leg="' + side + '">' + capsule(0, -6, w, 90 + L, sp.pants) +
    '<path d="M ' + f(-w / 2 - 4 + Math.min(0, out)) + " " + (92 + L) + " Q " + f(-w / 2 - 4 + Math.min(0, out)) + " " + (70 + L - big / 3) + " " + (side === "L" ? -4 : 4) + " " + (70 + L - big / 3) + " Q " + f(w / 2 + 6 + Math.max(0, out)) + " " + (70 + L - big / 3) + " " + f(w / 2 + 6 + Math.max(0, out)) + " " + (92 + L) + ' Z" fill="' + sp.shoes + '"/></g>';
}

/* ------------------------------------------------------------- build */
export function buildSVG(id, look) {
  const special = SPECIAL.get(look.body);
  if (special) {
    const S = special.spec(look);
    return { svg: special.build(id, look, S), S };
  }
  const S = specFor(look), sp = S.sp, fa = sp.face;
  const m = mouthSet(id);
  let head = hairBack(sp, look);
  head += '<ellipse cx="' + -(fa.rx - 6) + '" cy="' + (fa.cy + 6) + '" rx="19" ry="25" fill="' + sp.skin + '"/><ellipse cx="' + (fa.rx - 6) + '" cy="' + (fa.cy + 6) + '" rx="19" ry="25" fill="' + sp.skin + '"/>';
  head += '<ellipse cx="' + -(fa.rx - 4) + '" cy="' + (fa.cy + 8) + '" rx="8" ry="12" fill="' + sp.skinShade + '"/><ellipse cx="' + (fa.rx - 4) + '" cy="' + (fa.cy + 8) + '" rx="8" ry="12" fill="' + sp.skinShade + '"/>';
  if ((look.accessories || []).includes("earrings")) head += '<circle cx="' + -(fa.rx - 2) + '" cy="' + (fa.cy + 34) + '" r="6.5" fill="' + sp.accent + '"/><circle cx="' + (fa.rx - 2) + '" cy="' + (fa.cy + 34) + '" r="6.5" fill="' + sp.accent + '"/>';
  head += '<ellipse cx="0" cy="' + fa.cy + '" rx="' + fa.rx + '" ry="' + fa.ry + '" fill="' + sp.skin + '"/>';
  if (S.male && S.body.round) head += '<path d="M -44 -16 Q 0 6 44 -16" stroke="' + sp.skinShade + '" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>';
  head += '<g data-k="feat">';
  head += '<ellipse data-k="cheekL" cx="' + -sp.cheek.x + '" cy="' + sp.cheek.y + '" rx="' + sp.cheek.rx + '" ry="' + sp.cheek.ry + '" fill="' + sp.blush + '"/>';
  head += '<ellipse data-k="cheekR" cx="' + sp.cheek.x + '" cy="' + sp.cheek.y + '" rx="' + sp.cheek.rx + '" ry="' + sp.cheek.ry + '" fill="' + sp.blush + '"/>';
  head += S.male ? '<ellipse cx="0" cy="-74" rx="12" ry="9" fill="' + sp.skinShade + '"/>' : '<ellipse cx="0" cy="-74" rx="8" ry="6" fill="' + sp.skinShade + '"/>';
  if (S.old) head += '<path d="M -68 -96 l -10 -4 M -68 -88 l -12 0 M 68 -96 l 10 -4 M 68 -88 l 12 0" stroke="' + sp.skinShade + '" stroke-width="3" stroke-linecap="round"/>';
  head += eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp);
  if ((look.accessories || []).includes("glasses")) {
    const e = sp.eye;
    head += '<g fill="none" stroke="#3B2A44" stroke-width="5"><circle cx="' + -e.x + '" cy="' + e.y + '" r="' + (e.ry + 7) + '"/><circle cx="' + e.x + '" cy="' + e.y + '" r="' + (e.ry + 7) + '"/><path d="M ' + -(e.x - e.ry - 7) + " " + (e.y - 4) + " Q 0 " + (e.y - 12) + " " + (e.x - e.ry - 7) + " " + (e.y - 4) + '"/></g>';
  }
  head += '<linearGradient id="' + id + '-flush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0453A" stop-opacity=".95"/><stop offset=".3" stop-color="#E0453A" stop-opacity=".55"/><stop offset=".44" stop-color="#E0453A" stop-opacity="0"/></linearGradient>';
  head += '<ellipse data-k="red" cx="0" cy="' + fa.cy + '" rx="' + (fa.rx - 2) + '" ry="' + (fa.ry - 2) + '" fill="url(#' + id + '-flush)" opacity="0"/>';
  const b = sp.browAt;
  ["L", "R"].forEach((side) => {
    const x = side === "L" ? -b.x : b.x;
    const d = side === "L" ? "M " + -b.w + " 2 Q " + -2 + " " + -b.h + " " + b.w + " 0" : "M " + -b.w + " 0 Q 2 " + -b.h + " " + b.w + " 2";
    head += '<g data-brow="' + side + '" transform="translate(' + x + " " + b.y + ')"><path d="' + d + '" stroke="' + sp.brow + '" stroke-width="' + b.sw + '" fill="none" stroke-linecap="round"/></g>';
  });
  const extras = look.accessories || [];
  // the clown's red nose and the red ring his grin is painted in
  if (extras.includes("clownface")) head += '<circle cx="0" cy="-76" r="17" fill="#E0302A"/><circle cx="-5" cy="-81" r="5" fill="#FFFFFF" opacity=".6"/>' +
    '<path d="M -50 ' + (sp.mouthAt.y - 6) + " Q 0 " + (sp.mouthAt.y + 40) + " 50 " + (sp.mouthAt.y - 6) + " Q 30 " + (sp.mouthAt.y - 16) + " 0 " + (sp.mouthAt.y - 12) + " Q -30 " + (sp.mouthAt.y - 16) + " -50 " + (sp.mouthAt.y - 6) + ' Z" fill="#E0302A" opacity=".92"/>';
  // the colonel's goatee under the mouth (with the moustache above it)
  if (extras.includes("goatee")) head += '<path d="M -20 -22 Q 0 -14 20 -22 Q 16 2 0 12 Q -16 2 -20 -22 Z" fill="' + sp.hair + '"/>';
  if (extras.includes("mustache") || extras.includes("goatee")) head += '<path d="M 0 -60 Q -18 -66 -34 -52 Q -16 -54 0 -54 Q 16 -54 34 -52 Q 18 -66 0 -60 Z" fill="' + sp.hair + '"/>';
  head += '<g data-k="mouth" transform="translate(0 ' + sp.mouthAt.y + ") scale(" + sp.mouthAt.s + ')">' + m.rest + '<g data-k="talk">' + m.vis + "</g></g>";
  head += "</g>";
  head += '<g data-k="hairF">' + hairFront(sp, look) + hatSVG(sp, look) + "</g>";
  head += fxSVG(id, sp);
  const sh = sp.shoulder;
  let svg = '<ellipse data-k="shadow" cx="0" cy="2" rx="' + (sp.round ? 104 : 88) + '" ry="16" fill="#2B1B30" opacity=".18"/>';
  svg += '<g data-k="body">';
  svg += '<g data-k="legL" transform="translate(-30 ' + (-98 - sp.lext) + ')">' + legSVG(sp, "L") + "</g>";
  svg += '<g data-k="legR" transform="translate(30 ' + (-98 - sp.lext) + ')">' + legSVG(sp, "R") + "</g>";
  svg += '<g data-k="torso"><g transform="translate(0 ' + -sp.lext + ')">';
  svg += '<rect x="-17" y="-236" width="34" height="32" rx="10" fill="' + sp.skinShade + '"/>';
  svg += torsoSVG(sp, look) + badgeSVG(id, sp, look) + tieSVG(sp, look);
  svg += '<g data-k="head" transform="translate(0 -214)">' + head + "</g>";
  svg += '<g data-k="armL" transform="translate(' + -sh + ' -200)">' + armSVG(sp, look, "L", id) + "</g>";
  svg += '<g data-k="armR" transform="translate(' + sh + ' -200)">' + armSVG(sp, look, "R", id) + "</g>";
  svg += "</g></g></g>";
  return { svg, S };
}

/* ------------------------------------------------------------- the rig */
function proto() {
  return RIG.Rig.prototype;
}

// a Rig built on the film's prototype: same render(), same Actor
export function createKitRig(container, look, id) {
  const { svg: markup, S } = buildSVG(id, look);
  const rig = Object.create(proto());
  rig.who = look.id || "kit";
  rig.id = id;
  rig.sp = S.sp;
  rig.kit = S;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", S.viewBox);
  svg.setAttribute("class", "rig rig-kit");
  svg.setAttribute("overflow", "visible");
  svg.innerHTML = markup;
  container.appendChild(svg);
  rig.svg = svg;
  const q = (sel) => svg.querySelector(sel);
  rig.el = {
    body: q('[data-k="body"]'), torso: q('[data-k="torso"]'), head: q('[data-k="head"]'), shadow: q('[data-k="shadow"]'),
    feat: q('[data-k="feat"]'), hairF: q('[data-k="hairF"]'), red: q('[data-k="red"]'),
    cheekL: q('[data-k="cheekL"]'), cheekR: q('[data-k="cheekR"]'), mouth: q('[data-k="mouth"]'), talk: q('[data-k="talk"]'),
    legL: q('[data-k="legL"]'), legR: q('[data-k="legR"]'),
  };
  rig.mouths = {};
  svg.querySelectorAll("[data-m]").forEach((n) => (rig.mouths[n.getAttribute("data-m")] = n));
  rig.eyes = {};
  ["L", "R"].forEach((s) => {
    const g = svg.querySelector('[data-eye="' + s + '"]');
    const k = (x) => g.querySelector('[data-k="' + x + '"]');
    rig.eyes[s] = { g, n: k("n"), scl: k("scl"), pup: k("pup"), lt: k("lt"), ltl: k("ltl"), lb: k("lb"), wing: k("wing"), happy: k("happy"), closed: k("closed"), squeeze: k("squeeze"), star: k("star") };
  });
  rig.brows = { L: q('[data-brow="L"]'), R: q('[data-brow="R"]') };
  rig.arms = {};
  ["L", "R"].forEach((s) => {
    const g = q('[data-k="arm' + s + '"]');
    const hands = {};
    g.querySelectorAll("[data-h]").forEach((n) => (hands[n.getAttribute("data-h")] = n));
    rig.arms[s] = { g, x: (s === "L" ? -1 : 1) * S.sp.shoulder, elbow: g.querySelector('[data-k="elbow"]'), handpos: g.querySelector('[data-k="handpos"]'), hands };
  });
  rig.fx = {};
  svg.querySelectorAll("[data-fx]").forEach((n) => (rig.fx[n.getAttribute("data-fx")] = n));
  rig.steamP = svg.querySelectorAll('[data-fx="steam"] [data-p]');
  rig.cache = new Map();
  // a held prop (a mascot's sceptre, cup, fan, water sleeve) keeps to gravity: after the film's
  // render it turns back by everything its arm, forearm and hand turned (and the body's lean)
  const props = [...svg.querySelectorAll("[data-prop]")].map((el) => ({
    el, i: el.closest('[data-k="armL"]') ? 0 : 1, hand: !!el.closest('[data-k="handpos"]'), lean: +el.getAttribute("data-prop") || 0,
  }));
  if (props.length) {
    rig.render = function (st) {
      proto().render.call(this, st);
      props.forEach((p) => {
        const a = st.arms[p.i], sign = p.i === 0 ? 1 : -1;
        this.set(p.el, "transform", "rotate(" + f(p.lean - (st.lean || 0) - sign * (a[0] + a[1] + (p.hand ? a[3] || 0 : 0))) + ")");
      });
    };
  }
  return rig;
}
