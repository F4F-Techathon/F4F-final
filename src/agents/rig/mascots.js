// mascots.js — brand IPs as rig bodies (ported from agent-studio/web/js/mascots.js).
// A chain people know by its mascot (src/agents/generation/brands.ts) is not played by a
// generic owner: its body is drawn here as that mascot — 雪王's snowball and cape, 茶百道's
// panda, 霸王茶姬's opera dan, 茶颜悦色's lady with her fan, 星巴克's twin-tailed siren —
// keeping the brand's silhouette, palette and signature prop. Each one is built on the film
// rig's DOM contract (eyes with lids, brows, every mouth and viseme, arms with elbow /
// handpos and four hands, legs, effects) and registered with rigkit, so RIG.Actor plays all
// 20 expressions, 26 poses, 10 acts and 8 effects on it unchanged. Brand marks belong to
// their owners; these drawings are for the demo.

import { registerBody, mouthSet, eyeSVG, fxSVG, capsule, f, badgeAt } from "./rigkit.js";

/* ------------------------------------------------------------- helpers */
const ln = (c, w) => ' stroke="' + c + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"';
const pth = (d, fill, extra) => '<path d="' + d + '" fill="' + fill + '"' + (extra || "") + "/>";
const ell = (cx, cy, rx, ry, fill, extra) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || "") + "/>";
const circ = (cx, cy, r, fill, extra) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"' + (extra || "") + "/>";
const mirror = (g) => g + '<g transform="scale(-1 1)">' + g + "</g>";

function view(top) {
  return { viewBox: `-210 ${top} 420 ${30 - top}`, vbTop: top, vbH: 30 - top };
}

// brows: the film's shape in the mascot's ink, or none at all (雪王 and the panda have none —
// the groups stay, so the renderer still has something to move)
function brows(sp, color) {
  const b = sp.browAt;
  return ["L", "R"].map((side) => {
    const x = side === "L" ? -b.x : b.x;
    if (!color) return '<g data-brow="' + side + '" transform="translate(' + x + " " + b.y + ')"><path d="M 0 0" fill="none"/></g>';
    const d = side === "L" ? "M " + -b.w + " 2 Q -2 " + -b.h + " " + b.w + " 0" : "M " + -b.w + " 0 Q 2 " + -b.h + " " + b.w + " 2";
    return '<g data-brow="' + side + '" transform="translate(' + x + " " + b.y + ')"><path d="' + d + '" stroke="' + color + '" stroke-width="' + b.sw + '" fill="none" stroke-linecap="round"/></g>';
  }).join("");
}
// blush the renderer fades in and out; `alpha` keeps a mascot's resting face clean
function cheeks(sp, alpha) {
  const c = sp.cheek;
  return '<g opacity="' + alpha + '">' + ell(-c.x, c.y, c.rx, c.ry, sp.blush, ' data-k="cheekL"') + ell(c.x, c.y, c.rx, c.ry, sp.blush, ' data-k="cheekR"') + "</g>";
}
function flush(id, fa) {
  return '<linearGradient id="' + id + '-flush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0453A" stop-opacity=".95"/><stop offset=".3" stop-color="#E0453A" stop-opacity=".55"/><stop offset=".44" stop-color="#E0453A" stop-opacity="0"/></linearGradient>' +
    ell(0, fa.cy, fa.rx - 3, fa.ry - 3, "url(#" + id + '-flush)', ' data-k="red" opacity="0"');
}
function mouth(id, sp, colors) {
  const m = mouthSet(id, colors), at = sp.mouthAt;
  return '<g data-k="mouth" transform="translate(' + (at.x || 0) + " " + at.y + ") scale(" + at.s + ')">' + m.rest + '<g data-k="talk">' + m.vis + "</g></g>";
}
// a prop held in a hand (or hanging from a forearm) stays upright whatever the arm does:
// rigkit turns every [data-prop] back after each render; the value is its lean in degrees
const prop = (g, lean) => '<g data-prop="' + (lean || 0) + '">' + g + "</g>";
// four hands on the film's contract (open / fist / thumb / point), as a mitten or a small hand
function hands(side, fill, r, outline) {
  const o = outline || "";
  const t = side === "L" ? 1 : -1;
  const palm = (rr) => circ(0, 0, rr, fill, o);
  return '<g data-k="hand">' +
    '<g data-h="open">' + ell(t * r * 0.72, -r * 0.3, r * 0.36, r * 0.5, fill, o) + palm(r) + "</g>" +
    '<g data-h="fist" opacity="0">' + palm(r * 0.9) + "</g>" +
    '<g data-h="thumb" opacity="0">' + capsule(t * r * 0.4, r * 0.1, r * 0.6, r * 1.55, fill, o) + palm(r * 0.9) + "</g>" +
    '<g data-h="point" opacity="0">' + capsule(0, r * 0.3, r * 0.55, r * 1.75, fill, o) + palm(r * 0.9) + "</g></g>";
}
function arm(upper, forearm, hand, prop) {
  return upper + '<g data-k="elbow">' + forearm + '<g data-k="handpos">' + (prop || "") + hand + "</g></g>";
}
// the film rig's skeleton: legs, then the torso with the head (origin 214 above it) and the
// arms (14 below the head origin); the renderer drives every group by its data-k
function frame(S, P) {
  const sp = S.sp;
  let s = ell(0, 2, P.shadow, 16, "#2B1B30", ' data-k="shadow" opacity=".18"');
  s += '<g data-k="body">';
  s += '<g data-k="legL" transform="translate(-30 ' + (-98 - sp.lext) + ')">' + (P.legL || "") + "</g>";
  s += '<g data-k="legR" transform="translate(30 ' + (-98 - sp.lext) + ')">' + (P.legR || "") + "</g>";
  s += '<g data-k="torso"><g transform="translate(0 ' + -sp.lext + ')">' + P.torso + (P.badge || "");
  s += '<g data-k="head" transform="translate(0 -214)">' + P.head + "</g>";
  s += '<g data-k="armL" transform="translate(' + -sp.shoulder + ' -200)">' + P.armL + "</g>";
  s += '<g data-k="armR" transform="translate(' + sp.shoulder + ' -200)">' + P.armR + "</g>";
  return s + "</g></g></g>";
}
function headOf(id, sp, back, face, feat, front) {
  return back + face + '<g data-k="feat">' + feat + "</g>" + '<g data-k="hairF">' + front + "</g>" + fxSVG(id, sp);
}
function specOf(body, sp, top, scale) {
  const headOrigin = -(214 + sp.lext);
  return { sp, body, male: body.gender === "male", old: false, theme: sp.theme, scale, ...view(top), headOrigin, headTop: headOrigin + sp.top };
}

/* ======================================================= 雪王 · 蜜雪冰城 */
// a snowman king: a big snowball under a round head, a white crown, a red cape, the ice-cream
// sceptre, blue eyes, a carrot nose and the tongue out at the corner of his smile; thick ink
const SK = { ink: "#231815", white: "#FFFFFF", red: "#E60012", redDark: "#A8000E", blue: "#1D2B8F", blueDark: "#121C5E", orange: "#F39800", gold: "#F5B428", goldDark: "#C98510", cone: "#F7C14D", waffle: "#DE9418" };
const SNOWKING = { id: "snowking", brand: "mixue", zh: "雪人 · 雪王", gender: "male", height: "regular", lext: 71, W: 172, shoulder: 100, legW: 0, scale: 0.96 };

function snowkingSpec(look) {
  const sp = {
    theme: look.theme || SK.red, skin: SK.white, skinShade: "#E9EEF7", blush: "#FF8DA1", lext: 71, shoulder: 100, legW: 0, W: 172,
    face: { rx: 140, ry: 126, cy: -109 },
    eye: { x: 44, y: -126, rx: 19, ry: 27, white: SK.blue, pupil: SK.blueDark, pupilR: 0.48, ink: SK.blue, mode: SK.blue, lid: SK.white },
    browAt: { x: 44, y: -168, w: 0, h: 0, sw: 0 }, mouthAt: { x: 10, y: -64, s: 1.5 },
    cheek: { x: 86, y: -82, rx: 16, ry: 9 }, steamY: -356,
    fxShift: { excl: [0, -98], quest: [44, -40], anger: [-34, -26], sweat: [30, -12], tears: [0, -22], lines: [0, -16], sparkle: [0, -34] },
    top: -109 - 126 - 98, // the crown's top above the head origin
  };
  return specOf(SNOWKING, sp, -680, SNOWKING.scale);
}
function snowkingSVG(id, look, S) {
  const sp = S.sp, ink = (w) => ln(SK.ink, w);
  // torso (coordinates inside the torso: y + lext = ground)
  let torso = pth("M -84 -232 Q -152 -204 -178 -112 Q -202 -22 -208 52 Q -172 70 -134 58 Q -100 72 -62 62 L 62 62 Q 100 72 134 58 Q 172 70 208 52 Q 202 -22 178 -112 Q 152 -204 84 -232 Z", SK.red, ink(8));
  torso += pth("M 120 -196 Q 170 -150 186 -60 Q 196 8 200 50 Q 182 58 168 56 Q 170 -40 132 -150 Z", SK.redDark, ' opacity=".55"');
  torso += ell(0, -79, 172, 150, SK.white, ink(9));
  torso += pth("M 96 -150 Q 150 -100 158 -30", "none", ln("#DCE4F2", 10) + ' opacity=".8"');
  torso += pth("M -118 -214 Q 0 -168 118 -214 Q 126 -196 112 -186 Q 0 -146 -112 -186 Q -126 -196 -118 -214 Z", SK.red, ink(7));
  // head
  const fa = sp.face;
  const face = ell(0, fa.cy, fa.rx, fa.ry, SK.white, ink(9)) + pth("M -96 -176 Q -60 -214 -10 -222", "none", ln("#E9EEF7", 9));
  let feat = cheeks(sp, 0.5) + eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp) + flush(id, fa) + brows(sp, null);
  feat += pth("M -2 -112 Q 0 -128 22 -124 L 78 -100 Q 85 -94 76 -89 L 14 -85 Q -4 -89 -2 -112 Z", SK.orange, ink(6)) + pth("M 16 -114 L 46 -105", "none", ln("#FFD37E", 4) + ' opacity=".8"');
  feat += mouth(id, sp, {
    stroke: SK.blue, fill: SK.blueDark, tongue: SK.red, teeth: SK.white, lips: SK.red, sw: 1.15,
    extra: { smile: pth("M -21 -1 C -30 -6 -42 0 -40 12 C -38 22 -24 23 -20 12 C -18 6 -18 2 -21 -1 Z", SK.red, ln(SK.ink, 2.6)) },
  });
  const crown = pth("M -66 -212 L -76 -272 L -38 -244 L 0 -292 L 38 -244 L 76 -272 L 66 -212 Q 0 -198 -66 -212 Z", SK.white, ink(7)) +
    circ(-77, -278, 12, SK.white, ink(6)) + circ(0, -300, 14, SK.white, ink(6)) + circ(77, -278, 12, SK.white, ink(6));
  const head = headOf(id, sp, "", face, feat, crown);
  // arms: stubby snow arms, the left hand holds the sceptre
  const W = SK.white;
  const upper = capsule(0, -16, 46, 76, W, ink(7)) + circ(0, -2, 18, W);
  const fore = capsule(0, -12, 44, 64, W, ink(7)) + circ(0, 0, 16, W);
  const sceptre = prop(capsule(0, -100, 15, 244, SK.gold, ink(5)) + capsule(0, -112, 32, 16, SK.goldDark, ink(5)) +
    '<clipPath id="' + id + '-cone"><path d="M -38 -232 L 38 -232 L 4 -112 Q 0 -104 -4 -112 Z"/></clipPath>' +
    pth("M -38 -232 L 38 -232 L 4 -112 Q 0 -104 -4 -112 Z", SK.cone) +
    '<g clip-path="url(#' + id + '-cone)" stroke="' + SK.waffle + '" stroke-width="3.5">' +
    [-60, -36, -12, 12, 36].map((x) => '<path d="M ' + x + " -232 L " + (x + 70) + ' -112"/><path d="M ' + (x + 24) + " -232 L " + (x - 46) + ' -112"/>').join("") + "</g>" +
    pth("M -38 -232 L 38 -232 L 4 -112 Q 0 -104 -4 -112 Z", "none", ink(5)) +
    '<rect x="-42" y="-240" width="84" height="14" rx="7" fill="' + SK.gold + '"' + ink(5) + "/>" +
    ell(0, -262, 50, 26, W, ink(6)) + ell(2, -292, 38, 20, W, ink(6)) + ell(4, -318, 25, 15, W, ink(6)) + pth("M 0 -330 Q 8 -350 20 -340", "none", ink(6)), -14);
  return frame(S, {
    shadow: 178, torso, head, badge: badgeAt(id, look, 0, -66, 46),
    armL: arm(upper, fore, hands("L", W, 23, ink(6)), sceptre),
    armR: arm(upper, fore, hands("R", W, 23, ink(6))),
  });
}

/* ======================================================= 熊猫 · 茶百道 */
// a navy-and-white panda: a big round head with a thick navy outline, round ears, slanted eye
// patches, a chubby navy body with a white belly, and its cup of fruit tea with a straw
const PD = { navy: "#1F2C8F", navyDark: "#141E66", white: "#FFFFFF", tea: "#DCE4FF", pink: "#F4A6B8" };
const PANDA = { id: "panda", brand: "chabaidao", zh: "熊猫 · 茶百道", gender: "male", height: "short", lext: 30, W: 136, shoulder: 92, legW: 52, scale: 1.04 };

function pandaSpec(look) {
  const sp = {
    theme: look.theme || PD.navy, skin: PD.white, skinShade: "#E6EAF7", blush: PD.pink, lext: 30, shoulder: 92, legW: 52, W: 136,
    face: { rx: 128, ry: 114, cy: -104 },
    eye: { x: 46, y: -112, rx: 12, ry: 14, white: PD.white, pupil: PD.navyDark, pupilR: 0.62, ink: PD.navy, mode: PD.white, lid: PD.navy },
    browAt: { x: 46, y: -150, w: 0, h: 0, sw: 0 }, mouthAt: { x: 0, y: -46, s: 0.95 },
    cheek: { x: 80, y: -70, rx: 16, ry: 9 }, steamY: -300,
    fxShift: { excl: [0, -8], quest: [40, -10], anger: [-30, -6], sweat: [24, 4], tears: [0, -10], lines: [0, -2] },
    top: -104 - 114 - 40,
  };
  return specOf(PANDA, sp, -560, PANDA.scale);
}
function pandaSVG(id, look, S) {
  const sp = S.sp, N = PD.navy;
  const gap = ln(PD.white, 4);
  let torso = pth("M -84 -214 Q -128 -202 -136 -132 Q -144 -74 -112 -36 Q -64 -14 0 -14 Q 64 -14 112 -36 Q 144 -74 136 -132 Q 128 -202 84 -214 Z", N, gap);
  torso += ell(0, -100, 78, 72, PD.white);
  const leg = capsule(0, -6, 52, 116, N, gap) + ell(0, 100, 33, 17, N, gap) + capsule(0, -10, 44, 100, N);
  const fa = sp.face;
  const back = circ(-90, -196, 37, N, gap) + circ(90, -196, 37, N, gap) + circ(-90, -196, 17, PD.navyDark) + circ(90, -196, 17, PD.navyDark);
  const face = ell(0, fa.cy, fa.rx, fa.ry, PD.white, ln(N, 10));
  let feat = cheeks(sp, 0.45);
  feat += '<g transform="rotate(32 -50 -104)">' + ell(-50, -104, 30, 42, N) + "</g>" + '<g transform="rotate(-32 50 -104)">' + ell(50, -104, 30, 42, N) + "</g>";
  feat += eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp) + flush(id, fa) + brows(sp, null);
  feat += pth("M -15 -76 Q 0 -86 15 -76 Q 13 -63 0 -59 Q -13 -63 -15 -76 Z", N) + ell(-4, -77, 4, 2.5, PD.white, ' opacity=".8"');
  feat += mouth(id, sp, { stroke: N, fill: PD.navyDark, tongue: PD.pink, teeth: PD.white, lips: N });
  const head = headOf(id, sp, back, face, feat, "");
  const upper = capsule(0, -14, 44, 74, N, gap) + circ(0, -2, 17, N);
  const fore = capsule(0, -10, 42, 62, N, gap) + circ(0, 0, 15, N);
  const cupD = "M -32 -84 L 32 -84 L 24 8 Q 0 16 -24 8 Z";
  const cup = '<g data-prop="0"><g transform="translate(0 -4)">' + pth("M 10 -94 L 18 -196", "none", ln(PD.white, 13)) + pth("M 10 -94 L 18 -196", "none", ln(N, 7)) +
    pth(cupD, PD.white, ln(N, 5)) + pth("M -28 -40 L 28 -40 L 24 8 Q 0 16 -24 8 Z", PD.tea) + pth(cupD, "none", ln(N, 5)) +
    '<rect x="-37" y="-96" width="74" height="15" rx="7" fill="' + N + '"' + ln(PD.white, 3) + "/>" +
    pth("M -12 -62 Q 0 -78 12 -62 Q 0 -50 -12 -62 Z", N) + pth("M 0 -66 L 0 -56", "none", ln(PD.white, 2)) + "</g></g>";
  return frame(S, {
    shadow: 140, torso, head, legL: leg, legR: leg, badge: badgeAt(id, look, 0, -100, 40),
    armL: arm(upper, fore, hands("L", N, 22, gap), cup),
    armR: arm(upper, fore, hands("R", N, 22, gap)),
  });
}

/* ======================================================= 茶姬 · 霸王茶姬 */
// a Peking-opera dan in the brand's red and white: an arc of white pom-poms over the
// forehead, side pom-poms with hanging strings, black 片子 curls, rouge round the eyes, a red
// robe with a white collar and sash, and long white water sleeves
const CJ = { red: "#D7262E", redDark: "#9E121A", white: "#FFFFFF", skin: "#FFF4F0", rouge: "#F28A93", hair: "#1C1418", lips: "#D7262E" };
const OPERA = { id: "opera", brand: "chagee", zh: "京剧旦角 · 茶姬", gender: "female", height: "regular", lext: 50, W: 92, shoulder: 66, legW: 34, scale: 1 };

function operaSpec(look) {
  const sp = {
    theme: look.theme || CJ.red, skin: CJ.skin, skinShade: "#F1D9D2", blush: CJ.rouge, lext: 50, shoulder: 66, legW: 34, W: 92,
    face: { rx: 90, ry: 100, cy: -110 },
    eye: { x: 37, y: -108, rx: 21, ry: 12, white: "#FFFFFF", pupil: CJ.hair, pupilR: 0.6, ink: CJ.hair, mode: CJ.hair, lid: CJ.skin, lash: true },
    browAt: { x: 38, y: -138, w: 22, h: 8, sw: 4.5 }, mouthAt: { x: 0, y: -50, s: 0.72 },
    cheek: { x: 52, y: -84, rx: 22, ry: 14 }, steamY: -430,
    fxShift: { excl: [0, -136], quest: [44, -96], anger: [-34, -64], sweat: [14, -20], tears: [0, -16], lines: [0, -12], sparkle: [0, -40] },
    top: -110 - 100 - 112,
  };
  return specOf(OPERA, sp, -700, OPERA.scale);
}
function operaSVG(id, look, S) {
  const sp = S.sp, R = CJ.red, W = CJ.white;
  let torso = pth("M -54 -214 Q -72 -210 -80 -190 L -104 -80 Q -120 -6 -126 40 Q 0 54 126 40 Q 120 -6 104 -80 L 80 -190 Q 72 -210 54 -214 Z", R);
  torso += pth("M 56 -206 Q 76 -200 80 -186 L 104 -80 Q 120 -6 124 38 Q 108 42 96 42 Q 96 -60 56 -206 Z", CJ.redDark, ' opacity=".45"');
  torso += '<rect x="-17" y="-236" width="34" height="32" rx="10" fill="#F1D9D2"/>';
  torso += pth("M -36 -216 Q -10 -184 18 -144", "none", ln(W, 13)) + pth("M 36 -216 Q 20 -196 4 -174", "none", ln(W, 13));
  torso += '<rect x="-84" y="-132" width="168" height="15" rx="7" fill="' + W + '"/>' + pth("M -12 -120 L -22 -36 M 10 -120 L 18 -40", "none", ln(W, 8));
  torso += pth("M -122 30 Q -60 40 0 38 Q 60 40 122 30", "none", ln(W, 8)) + pth("M -84 -40 q -14 -18 4 -26 q 16 -4 14 12 M 64 -10 q -14 -18 4 -26 q 16 -4 14 12", "none", ln(W, 4));
  const leg = capsule(0, -6, 30, 120, "#F4E6E2") + pth("M -19 112 Q -19 98 0 96 Q 22 96 22 112 Z", R);
  const fa = sp.face;
  const back = pth("M -94 -132 Q -108 -40 -82 14 L 82 14 Q 108 -40 94 -132 Z", CJ.hair);
  const face = ell(0, fa.cy, fa.rx, fa.ry, CJ.skin);
  const rouge = '<radialGradient id="' + id + '-rouge"><stop offset="0" stop-color="' + CJ.rouge + '" stop-opacity=".75"/><stop offset=".6" stop-color="' + CJ.rouge + '" stop-opacity=".35"/><stop offset="1" stop-color="' + CJ.rouge + '" stop-opacity="0"/></radialGradient>';
  let feat = rouge + ell(-36, -98, 40, 34, "url(#" + id + '-rouge)') + ell(36, -98, 40, 34, "url(#" + id + '-rouge)') + cheeks(sp, 0.6);
  feat += eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp) + flush(id, fa) + brows(sp, CJ.hair);
  feat += pth("M 2 -92 Q 6 -78 0 -72", "none", ln("#E2B8AE", 3));
  feat += mouth(id, sp, { stroke: CJ.lips, fill: CJ.redDark, tongue: "#F48A96", teeth: W, lips: CJ.lips, sw: 1.2 });
  const curls = pth("M -96 -146 Q -84 -206 0 -212 Q 84 -206 96 -146 Q 76 -166 56 -148 Q 42 -172 22 -150 Q 0 -176 -22 -150 Q -42 -172 -56 -148 Q -76 -166 -96 -146 Z", CJ.hair) +
    mirror(pth("M -94 -150 Q -114 -96 -98 -40 Q -88 -70 -84 -104 Q -86 -130 -94 -150 Z", CJ.hair));
  const balls = [[-104, -212, 25], [-76, -256, 27], [-38, -284, 28], [0, -294, 29], [38, -284, 28], [76, -256, 27], [104, -212, 25]]
    .map(([x, y, r]) => circ(x, y, r, W, ln(R, 3.5)) + circ(x, y, r * 0.32, R)).join("");
  const band = pth("M -100 -196 Q 0 -246 100 -196 Q 94 -183 88 -179 Q 0 -224 -88 -179 Q -94 -183 -100 -196 Z", W, ln(R, 3)) +
    [-60, -30, 0, 30, 60].map((x) => circ(x, -212 + Math.abs(x) * 0.28 - (x === 0 ? 8 : 0), 5, R)).join("");
  const sides = mirror(circ(-108, -156, 21, W, ln(R, 3.5)) + circ(-108, -156, 7, R) + pth("M -110 -136 L -114 -36", "none", ln(W, 3)) +
    circ(-112, -96, 4.5, R) + circ(-113, -66, 4.5, R) + circ(-114, -36, 6, W, ln(R, 2)));
  const front = curls + balls + band + sides + circ(0, -200, 9, W, ln(R, 3)) + circ(0, -200, 3.5, R);
  const head = headOf(id, sp, back, face, feat, front);
  const upper = capsule(0, -10, 34, 72, R);
  const fore = capsule(0, -6, 32, 58, R) + capsule(0, 40, 37, 14, W);
  const sleeve = prop(pth("M -18 -4 Q -24 40 -16 92 Q -2 104 12 94 Q 22 44 18 -4 Z", W) + pth("M -12 30 Q -14 60 -8 88", "none", ln("#F3D7D9", 3)));
  return frame(S, {
    shadow: 120, torso, head, legL: leg, legR: leg, badge: badgeAt(id, look, -52, -162, 30),
    armL: arm(upper, fore, hands("L", CJ.skin, 15), sleeve),
    armR: arm(upper, fore, hands("R", CJ.skin, 15), sleeve),
  });
}

/* ======================================================= 仕女 · 茶颜悦色 */
// a classical lady in ink-line style: a tall looped bun with a hairpin, willow brows, a
// 花钿 on the brow, a cream crossed-collar top over a wine-red skirt with wide sleeves,
// and a round fan painted with a plum branch
const SY = { wine: "#A61E36", wineDark: "#741326", ink: "#1E1416", cream: "#FBF5EA", skin: "#FFF2E8", lips: "#C8102E", gold: "#C9A44C", wood: "#6B3A2A" };
const LADY = { id: "lady", brand: "sexytea", zh: "古风仕女 · 茶颜悦色", gender: "female", height: "regular", lext: 46, W: 88, shoulder: 64, legW: 32, scale: 1 };

function ladySpec(look) {
  const sp = {
    theme: look.theme || SY.wine, skin: SY.skin, skinShade: "#EDD5C6", blush: "#F2A2A2", lext: 46, shoulder: 64, legW: 32, W: 88,
    face: { rx: 86, ry: 98, cy: -108 },
    eye: { x: 35, y: -106, rx: 20, ry: 11, white: "#FFFFFF", pupil: SY.ink, pupilR: 0.62, ink: SY.ink, mode: SY.ink, lid: SY.skin, lash: true },
    browAt: { x: 37, y: -134, w: 21, h: 7, sw: 4 }, mouthAt: { x: 0, y: -50, s: 0.7 },
    cheek: { x: 52, y: -80, rx: 19, ry: 11 }, steamY: -470,
    fxShift: { excl: [0, -188], quest: [56, -120], anger: [-34, -62], sweat: [14, -22], tears: [0, -12], lines: [0, -10], sparkle: [0, -50] },
    top: -108 - 98 - 160,
  };
  return specOf(LADY, sp, -740, LADY.scale);
}
function ladySVG(id, look, S) {
  const sp = S.sp, ink = (w) => ln(SY.ink, w);
  let torso = pth("M -62 -176 L -100 -40 Q -112 20 -118 38 Q 0 52 118 38 Q 112 20 100 -40 L 62 -176 Z", SY.wine, ink(3.5));
  torso += pth("M -34 -150 L -46 30 M 0 -150 L 0 40 M 34 -150 L 46 30", "none", ln(SY.wineDark, 2.5));
  torso += '<rect x="-17" y="-236" width="34" height="32" rx="10" fill="#EDD5C6"/>';
  torso += pth("M -56 -214 Q -70 -210 -76 -192 L -82 -164 L 82 -164 L 76 -192 Q 70 -210 56 -214 Z", SY.cream, ink(3.5));
  torso += pth("M -30 -216 L 22 -166 M 30 -216 L -4 -186", "none", ln(SY.wine, 9)) + pth("M -30 -216 L 22 -166", "none", ink(2));
  torso += '<rect x="-68" y="-178" width="136" height="15" rx="6" fill="' + SY.cream + '"' + ink(3) + "/>" + pth("M -6 -166 Q -14 -120 -10 -70 M 6 -166 Q 12 -124 10 -78", "none", ln(SY.wine, 7));
  const leg = capsule(0, -6, 28, 120, SY.cream) + pth("M -18 112 Q -18 98 0 96 Q 20 96 20 112 Z", SY.wine);
  const fa = sp.face;
  const loop = "M -14 -206 C -54 -246 -104 -306 -78 -352 C -56 -390 -2 -380 4 -330 C 8 -290 -4 -246 6 -214";
  const back = pth("M -88 -128 Q -102 -60 -78 -8 L 78 -8 Q 102 -60 88 -128 Z", SY.ink) +
    pth(loop, "none", ln("#4A3A42", 34)) + pth(loop, "none", ln(SY.ink, 27)) + pth("M -74 -330 C -70 -362 -40 -372 -18 -350", "none", ln("#5C4A52", 4)) +
    ell(8, -212, 40, 26, SY.ink, ln("#4A3A42", 3));
  const face = ell(0, fa.cy, fa.rx, fa.ry, SY.skin, ink(3));
  let feat = cheeks(sp, 0.7) + eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp) + flush(id, fa) + brows(sp, SY.ink);
  feat += pth("M 0 -152 Q 6 -144 0 -136 Q -6 -144 0 -152 Z", SY.lips) + pth("M 2 -96 Q 6 -82 0 -76", "none", ink(2.5));
  feat += mouth(id, sp, { stroke: SY.lips, fill: SY.wineDark, tongue: "#F08A96", teeth: "#FFFFFF", lips: SY.lips, sw: 1.15 });
  const front = pth("M -92 -110 Q -96 -200 0 -212 Q 96 -200 92 -110 Q 80 -168 0 -178 Q -80 -168 -92 -110 Z", SY.ink, ln("#4A3A42", 3)) +
    pth("M -60 -190 Q -20 -206 30 -198", "none", ln("#5C4A52", 4)) +
    mirror(pth("M -90 -118 Q -100 -78 -86 -36 L -78 -38 Q -84 -86 -76 -126 Z", SY.ink)) +
    pth("M 34 -228 L 112 -272", "none", ln(SY.gold, 5)) + [0, 72, 144, 216, 288].map((a) => circ(f(112 + 9 * Math.cos((a * Math.PI) / 180)), f(-272 + 9 * Math.sin((a * Math.PI) / 180)), 6.5, SY.wine)).join("") + circ(112, -272, 4, SY.gold);
  const head = headOf(id, sp, back, face, feat, front);
  const upper = capsule(0, -10, 34, 72, SY.cream, ink(3));
  const sleeveDrape = prop(pth("M -17 -4 Q -36 40 -32 80 Q -8 96 17 82 Q 24 40 17 -4 Z", SY.cream, ink(3)));
  const fore = sleeveDrape + capsule(0, 42, 34, 12, SY.wine, ink(2.5));
  const fan = '<g data-prop="0"><g transform="translate(0 -6)">' + pth("M 0 6 L 0 -44", "none", ln(SY.wood, 5)) + circ(0, -86, 42, SY.cream, ln(SY.wood, 4)) +
    pth("M -30 -64 Q -8 -84 6 -114 M -6 -88 Q 10 -94 24 -100", "none", ink(2.6)) +
    [[-14, -76], [4, -108], [20, -99], [-2, -92]].map(([x, y]) => circ(x, y, 4.6, SY.wine) + circ(x, y, 1.6, "#FFFFFF")).join("") +
    pth("M 0 8 L 0 38", "none", ln(SY.wine, 4)) + "</g></g>";
  return frame(S, {
    shadow: 122, torso, head, legL: leg, legR: leg, badge: badgeAt(id, look, -46, -112, 28),
    armL: arm(upper, fore, hands("L", SY.skin, 14, ink(2)), fan),
    armR: arm(upper, fore, hands("R", SY.skin, 14, ink(2))),
  });
}

/* ======================================================= 塞壬 · 星巴克 */
// a twin-tailed siren in green and white: a crown with a star, long wavy hair framing a white
// face, and two fish tails rising at her sides; she carries a coffee cup
const ST = { green: "#00704A", greenDark: "#004B33", ink: "#00402B", white: "#FFFFFF", sleeve: "#C9A27E" };
const SIREN = { id: "siren", brand: "starbucks", zh: "双尾塞壬 · 星巴克", gender: "female", height: "regular", lext: 70, W: 70, shoulder: 62, legW: 0, scale: 0.98 };

function sirenSpec(look) {
  const sp = {
    theme: look.theme || ST.green, skin: ST.white, skinShade: "#E2EFE8", blush: "#F4B6B0", lext: 70, shoulder: 62, legW: 0, W: 70,
    face: { rx: 86, ry: 96, cy: -106 },
    eye: { x: 34, y: -104, rx: 19, ry: 12, white: "#FFFFFF", pupil: ST.greenDark, pupilR: 0.62, ink: ST.ink, mode: ST.ink, lid: ST.white, lash: true },
    browAt: { x: 36, y: -134, w: 20, h: 7, sw: 4.5 }, mouthAt: { x: 0, y: -48, s: 0.8 },
    cheek: { x: 52, y: -78, rx: 18, ry: 10 }, steamY: -430,
    fxShift: { excl: [0, -128], quest: [44, -96], anger: [-34, -70], sweat: [12, -30], tears: [0, -6], lines: [0, -4], sparkle: [0, -40] },
    top: -106 - 96 - 96,
  };
  return specOf(SIREN, sp, -660, SIREN.scale);
}
function sirenSVG(id, look, S) {
  const sp = S.sp, G = ST.green, W = ST.white;
  const tail = (d) => pth(d, "none", ln(W, 54)) + pth(d, "none", ln(G, 44)) + pth(d, "none", ln(W, 7) + ' stroke-dasharray="0.1 15" opacity=".9"');
  const fin = "M -150 -296 C -192 -322 -208 -372 -192 -404 C -176 -376 -160 -356 -150 -334 C -142 -356 -124 -382 -104 -404 C -96 -370 -114 -326 -150 -296 Z";
  let torso = mirror(tail("M -24 20 C -118 6 -172 -74 -164 -168 C -158 -228 -148 -262 -150 -300") + pth(fin, G, ln(W, 4)));
  torso += pth("M -66 -112 Q -100 -40 -114 30 Q 0 66 114 30 Q 100 -40 66 -112 Z", G, ln(W, 4));
  torso += [[-50, -50], [0, -60], [50, -50], [-74, 0], [-24, -6], [24, -6], [74, 0]].map(([x, y]) => pth("M " + (x - 18) + " " + y + " Q " + x + " " + (y + 16) + " " + (x + 18) + " " + y, "none", ln(W, 3.5))).join("");
  torso += '<rect x="-16" y="-236" width="32" height="32" rx="10" fill="#E2EFE8"/>';
  torso += pth("M -48 -212 Q -64 -206 -70 -186 L -70 -110 Q 0 -98 70 -110 L 70 -186 Q 64 -206 48 -212 Q 0 -196 -48 -212 Z", G, ln(W, 3));
  torso += pth("M -60 -150 Q 0 -134 60 -150", "none", ln(W, 3.5));
  const fa = sp.face;
  const wave = (x, y0, y1) => pth("M " + x + " " + y0 + " Q " + (x + 14) + " " + (y0 + (y1 - y0) / 4) + " " + x + " " + (y0 + (y1 - y0) / 2) + " Q " + (x - 14) + " " + (y0 + (3 * (y1 - y0)) / 4) + " " + x + " " + y1, "none", ln(W, 4));
  const back = pth("M -96 -150 Q -132 -60 -122 40 Q -104 108 -62 98 L 62 98 Q 104 108 122 40 Q 132 -60 96 -150 Z", G) + mirror(wave(-112, -80, 70) + wave(-90, -40, 90));
  const face = ell(0, fa.cy, fa.rx, fa.ry, ST.white, ln(G, 3.5));
  let feat = cheeks(sp, 0.4) + eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp) + flush(id, fa) + brows(sp, ST.ink);
  feat += pth("M 2 -92 Q 7 -76 -1 -70", "none", ln(ST.ink, 3));
  feat += mouth(id, sp, { stroke: G, fill: ST.greenDark, tongue: "#4FA67F", teeth: W, lips: G, sw: 1.1 });
  const lock = pth("M -88 -122 Q -118 -64 -98 -12 Q -122 30 -102 70 Q -94 100 -72 110 Q -86 72 -78 32 Q -94 -10 -72 -60 Q -80 -98 -64 -132 Z", G, ln(W, 3)) + wave(-92, -60, 60);
  const crown = pth("M -64 -190 L -72 -238 L -36 -214 L 0 -246 L 36 -214 L 72 -238 L 64 -190 Q 0 -206 -64 -190 Z", W, ln(G, 4));
  const star = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 9 : 22;
    star.push(f(Math.cos(a) * r) + "," + f(-268 + Math.sin(a) * r));
  }
  const front = pth("M -92 -112 Q -96 -198 0 -208 Q 96 -198 92 -112 Q 70 -168 0 -176 Q -70 -168 -92 -112 Z", G, ln(W, 3)) + mirror(lock) +
    crown + '<polygon points="' + star.join(" ") + '" fill="' + W + '"' + ln(G, 4) + "/>";
  const head = headOf(id, sp, back, face, feat, front);
  const upper = capsule(0, -10, 28, 72, W, ln(G, 3));
  const fore = capsule(0, -6, 26, 60, W, ln(G, 3)) + capsule(0, 36, 30, 10, G);
  const cup = prop(pth("M -21 -66 L 21 -66 L 16 6 Q 0 10 -16 6 Z", W, ln(G, 3)) + '<rect x="-19" y="-44" width="38" height="20" fill="' + ST.sleeve + '"/>' +
    '<rect x="-24" y="-75" width="48" height="11" rx="5" fill="' + W + '"' + ln(G, 3) + "/>" + circ(0, -34, 11, G) + circ(0, -34, 4, W));
  return frame(S, {
    shadow: 128, torso, head, badge: badgeAt(id, look, -34, -168, 28),
    armL: arm(upper, fore, hands("L", W, 13, ln(G, 2.5)), cup),
    armR: arm(upper, fore, hands("R", W, 13, ln(G, 2.5))),
  });
}

/* ------------------------------------------------------------- registry */
export const MASCOTS = [
  { ...SNOWKING, spec: snowkingSpec, build: snowkingSVG },
  { ...PANDA, spec: pandaSpec, build: pandaSVG },
  { ...OPERA, spec: operaSpec, build: operaSVG },
  { ...LADY, spec: ladySpec, build: ladySVG },
  { ...SIREN, spec: sirenSpec, build: sirenSVG },
];
MASCOTS.forEach((m) => registerBody(m.id, m));

export function mascot(body) {
  return MASCOTS.find((m) => m.id === body) || null;
}
