// 개념 도식(SVG) 렌더러 — diagrams/specs/<slug>.json → 인라인 SVG 문자열
//
// 스타일은 tools/figlib.py(학회 기록용 SVG DSL)를 따른다. figlib는 좌표를 손으로
// 찍지만, 여기서는 용어마다 좌표를 쓰지 않도록 type과 노드·엣지(또는 type별 필드)만
// 받아 자동 배치한다. type별 배치는 types/*.js, 공통부는 core.js.
//
// 웹 대응:
// - width/height 없이 viewBox만 쓴다(CSS가 width:100%로 늘인다).
// - 색은 전부 CSS 변수(--dg-*)라 다크 모드 값은 style.css가 따로 준다. 그래서
//   <img src=.svg>가 아니라 페이지에 인라인으로 넣어야 한다.
// - 일부 type은 가로·세로 두 벌을 만들고 CSS가 폭에 따라 하나만 보여 준다.
//
// 브라우저 없이 빌드하므로 글자 폭은 근사치(textWidth)로 잰다. 줄바꿈과 겹침
// 검사가 모두 이 근사에 기대므로, 실제보다 약간 넓게 잡는다(core.js SAFETY).
"use strict";

const core = require("./core.js");
const TYPE_MODS = require("./types/index.js");
const { COLORS, TONES, MARGIN, H_WRAP_W, textWidth, wrap, esc, Canvas, drawNotes, checkOverlaps, checkBounds } = core;

const TYPES = Object.keys(TYPE_MODS);

// ── 검증 ─────────────────────────────────────────────────
// knownSlugs: terms.json의 slug 집합(없으면 slug 존재 검사는 건너뜀)
function validateSpec(spec, knownSlugs) {
  const errs = [];
  if (!spec || typeof spec !== "object") return ["스펙이 객체가 아님"];
  if (!spec.slug) errs.push("slug 없음");
  else if (knownSlugs && !knownSlugs.has(spec.slug)) errs.push(`terms.json에 없는 slug: ${spec.slug}`);
  const mod = TYPE_MODS[spec.type];
  // null 같은 항목이 섞이면 type 검증이 예외를 내므로 먼저 걸러 오류로 돌려준다.
  const notObj = (k) => Array.isArray(spec[k]) && spec[k].some((v) => !v || typeof v !== "object");
  const badItems = ["nodes", "edges"].filter(notObj);
  for (const k of badItems) errs.push(`${k} 항목이 객체가 아님`);
  if (!mod) errs.push(`type이 올바르지 않음: ${spec.type}`);
  else if (!badItems.length) errs.push(...mod.validate(spec));
  for (const note of spec.notes || []) {
    if (note.tone && !TONES.includes(note.tone)) errs.push(`알 수 없는 note tone: ${note.tone}`);
  }
  if (typeof spec.reviewed !== "boolean") errs.push("reviewed(true/false) 없음");
  if (!spec.source) errs.push("source 없음");
  return errs;
}

// ── 접근성 문장 ─────────────────────────────────────────
function describe(spec, title) {
  return TYPE_MODS[spec.type].describe(spec, title);
}

// ── 공개 API ────────────────────────────────────────────
// orientation: "h"(기본) | "v". 세로판이 없는 type은 "h"만 의미가 있다.
function renderSpec(spec, { title, orientation = "h", idPrefix } = {}) {
  const t = title || spec.title || spec.slug;
  const prefix = `dg-${(idPrefix || spec.slug).replace(/[^a-zA-Z0-9-]/g, "")}-${orientation}`;
  const cv = new Canvas(prefix);
  const mod = TYPE_MODS[spec.type];
  if (!mod) throw new Error(`알 수 없는 type: ${spec.type}`);
  const ext = mod.layout(cv, spec, orientation);
  let width = Math.ceil(ext.w);
  // 주석은 도식 폭에 맞춰 줄바꿈하되, 도식이 아주 좁으면 최소 폭을 준다.
  if (spec.notes && spec.notes.length) width = Math.max(width, orientation === "v" ? 340 : 360);
  const height = Math.ceil(drawNotes(cv, spec.notes, width, ext.h + 6) + MARGIN);
  const warnings = [...checkOverlaps(cv), ...checkBounds(cv.texts, width, height)];
  const desc = describe(spec, t);
  const defs = cv.markers.size ? `<defs>${[...cv.markers.values()].map((m) => m.def).join("")}</defs>` : "";
  const svg =
    // max-width를 viewBox 폭(px)으로 걸어 둔다. 안 그러면 좁은 도식(contrast 등)이
    // 컬럼 폭까지 늘어나 글자가 체인 도식의 두 배 크기로 보인다.
    `<svg class="dg dg-${orientation}" viewBox="0 0 ${width} ${height}" style="max-width:${width}px" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${prefix}-t ${prefix}-d" font-family="'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif">` +
    `<title id="${prefix}-t">${esc(t)}</title><desc id="${prefix}-d">${esc(desc)}</desc>${defs}${cv.parts.join("")}</svg>`;
  return { svg, width, height, warnings, desc, texts: cv.texts, boxes: cv.boxes };
}

// 본문 컬럼(--max-width 760 − 여백)에서 도식이 원래 크기로 들어가는 최대 폭. 가로판이
// 이보다 넓으면 어느 화면에서도 축소돼 글자가 작아지므로 세로판만 싣는다.
const H_FIT_W = 680;

// 페이지에 넣을 <figure> 전체. type이 원하면 가로·세로 두 벌을 넣는다.
function renderFigure(spec, title) {
  const mod = TYPE_MODS[spec.type];
  const h = renderSpec(spec, { title, orientation: "h" });
  const v = mod.dual(spec, h.width) ? renderSpec(spec, { title, orientation: "v" }) : null;
  const vOnly = !!v && h.width > H_FIT_W;
  const warnings = [...(vOnly ? [] : h.warnings.map((w) => `[가로] ${w}`)), ...(v ? v.warnings.map((w) => `[세로] ${w}`) : [])];
  const cls = `concept-diagram${v && !vOnly ? " dg-dual" : ""}`;
  const cap = mod.caption ? `<figcaption>${esc(mod.caption)}</figcaption>` : "";
  // spec.source는 검수용 메모라 페이지에 싣지 않는다. 사전의 정의 본문에도 출처를
  // 달지 않는데 도식에만 붙이면 형식이 어긋나고, 검증 전 서지가 권위처럼 보인다.
  const html = `<figure class="${cls}" data-type="${spec.type}">${vOnly ? "" : h.svg}${v ? v.svg : ""}${cap}</figure>`;
  return { html, warnings, desc: h.desc };
}

module.exports = { TYPES, COLORS, H_WRAP_W, H_FIT_W, textWidth, wrap, validateSpec, renderSpec, renderFigure, describe, Canvas, checkOverlaps };
