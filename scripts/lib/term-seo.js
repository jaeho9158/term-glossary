// 용어 페이지 SEO 공통 규칙 — title/description, 같은 분야 관련 용어 채우기, 연구할Lab 단계 링크.
// build-term-page.js(신규 생성), generate-related-html.js(관련 용어 재렌더),
// apply-term-seo.js(기존 산출물 일괄 적용)가 모두 이 모듈을 쓴다 — 규칙이 한 곳에만 있어야
// 다음 재생성 때 서로 다른 결과로 되돌아가지 않는다.
const { buildRelatedScorer } = require("./related-score.js");
const { escapeHtml } = require("../../assets/escape.js");

// 검색 의도에 맞춰 손으로 쓴 개별 title/description(data/seo-overrides.json). 있으면 자동 생성보다 먼저 쓴다.
let overrides = null;
function override(term) {
  if (!overrides) overrides = require("../../data/seo-overrides.json");
  const o = overrides[term.slug];
  return o && !String(term.slug).startsWith("_") ? o : null;
}

const SITE = "논문용어사전";
const TITLE_MAX = 60;
const TITLE_DEF_MAX = 25;
const DESC_MIN = 120;
const DESC_MAX = 150;
const RELATED_TARGET = 10; // 관련 용어 목표 개수(기존 링크 포함). 8~10 범위의 상한까지 채운다.

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/** 영문명에서 괄호 보충 설명을 뗀다: "Hyangga (Silla-Goryeo Vernacular Songs)" → "Hyangga". */
function shortEn(en) {
  return clean(en).replace(/\s*\([^)]*\)\s*$/, "").trim() || clean(en);
}

/** 한글명(영문명) — 둘이 같거나 한쪽이 비면 중복 없이. compact=true 면 영문명의 괄호 보충을 뗀다. */
function termLabel(term, compact = false) {
  const ko = clean(term.title_ko);
  const en = compact ? shortEn(term.title_en) : clean(term.title_en);
  if (!ko) return en;
  if (!en || ko.toLowerCase() === en.toLowerCase()) return ko;
  return `${ko}(${en})`;
}

/** definition 첫 문장(마침표 포함). 소수점 등은 뒤에 공백이 올 때만 문장 끝으로 본다. */
function firstSentence(def) {
  const d = clean(def);
  const m = d.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return m ? m[0].trim() : d;
}

/** 한 줄 정의를 max 자 안으로. '~입니다.' 꼬리는 떼고, 넘치면 어절 경계에서 자르고 '…'. */
function shortDefinition(def, max) {
  let s = firstSentence(def).replace(/[.!?]$/, "");
  s = s.replace(/\s*(입니다|이다|이에요|예요)$/, "").trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  if (sp >= Math.floor(max * 0.5)) cut = cut.slice(0, sp);
  return cut.replace(/[\s,·(]+$/, "") + "…";
}

const TITLE_SUFFIX = "쉬운 설명·예시";

/** 영문명 단어 머리글자와 일치하는 대문자 약어 별칭(예: Implicit Association Test → IAT). 없으면 "". */
function acronymAlias(term) {
  const en = shortEn(term.title_en);
  const words = en.split(/[\s\-\/,]+/).filter((w) => w && !/^(of|and|the|for|in|to|a|an|&)$/i.test(w));
  const initials = words.map((w) => w[0].toUpperCase()).join("");
  for (const a of term.aliases || []) {
    const v = clean(a);
    if (!/^[A-Z][A-Za-z]{1,7}$/.test(v) || !/^[A-Z]{2,}/.test(v)) continue;
    if (v.toUpperCase() !== initials) continue;
    if (new RegExp("(^|[^A-Za-z])" + v + "($|[^A-Za-z])", "i").test(en)) continue;
    return v;
  }
  return "";
}

/**
 * title: `한글명(영문명[, 약어]) 뜻 — 쉬운 설명·예시 | 논문용어사전`, 60자 안.
 * 사용자가 치는 검색어("OO 뜻", "IAT 검사")가 앞쪽에 그대로 들어가게 하고, 정의는 중간에서 잘린 채
 * 제목에 넣지 않는다(정의는 description 이 맡는다). 넘치면 (1) 약어 (2) 보충 문구 (3) 영문명 순으로 뺀다.
 */
function buildTermTitle(term) {
  const o = override(term);
  if (o && o.title) return o.title;
  const tail = ` | ${SITE}`;
  const ko = clean(term.title_ko);
  const en = shortEn(term.title_en);
  const acr = acronymAlias(term);
  const labels = [];
  if (ko && en && ko.toLowerCase() !== en.toLowerCase()) {
    if (acr) labels.push(`${ko}(${en}, ${acr})`);
    labels.push(`${ko}(${en})`);
  }
  labels.push(ko || en);
  const full = clean(term.title_en);
  if (full !== en && ko && ko.toLowerCase() !== en.toLowerCase()) labels.push(`${ko}(${full})`);
  const fits = (t) => t.length <= TITLE_MAX;
  for (const l of labels) {
    for (const mid of [` 뜻 — ${TITLE_SUFFIX}`, " 뜻"]) {
      const t = `${l}${mid}${tail}`;
      if (fits(t)) return t;
    }
  }
  return `${ko || en} 뜻${tail}`;
}

/**
 * description: 정의 첫 문장을 어미 그대로 보여 준다(안내 문구 없음). 150자 안.
 * 정의가 길면 어절 경계에서 자르고 …, 이때는 안내를 붙이지 않는다.
 */
function buildTermDescription(term) {
  const o = override(term);
  if (o && o.description) return o.description;
  // 문장 끝은 괄호 밖의 마침표만 본다. 어미(합쇼체 등)는 정의 그대로 둔다.
  const def = clean(term.definition);
  let depth = 0, end = def.length;
  for (let i = 0; i < def.length; i++) {
    const c = def[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[.!?]/.test(c) && (i + 1 === def.length || /\s/.test(def[i + 1]))) { end = i + 1; break; }
  }
  let body = def.slice(0, end);
  if (body.length > DESC_MAX) {
    let cut = body.slice(0, DESC_MAX - 1);
    const sp = cut.lastIndexOf(" ");
    if (sp >= DESC_MAX * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[\s,·(.]+$/, "") + "…";
  }
  return body;
}

// ---------- 같은 분야 관련 용어 ----------

/** terms 전체로 분야 색인을 만든다: subcategory별 용어 목록 + 관련성 점수 함수(related-score.js). */
function buildFieldIndex(terms) {
  const bySub = new Map();
  for (const t of terms) {
    if (!t.subcategory) continue;
    const subKey = `${(t.categories || [])[0] || ""}|${t.subcategory}`;
    if (!bySub.has(subKey)) bySub.set(subKey, []);
    bySub.get(subKey).push(t);
  }
  return { bySub, score: buildRelatedScorer(terms) };
}

// related(existing) 뒤에 덧붙일 같은 분야 용어. 최대 target 개까지.
// 후보는 같은 subcategory 안에서 관련성 점수가 FILL_MIN_SCORE 이상인 것만, 점수순.
// 하한을 넘는 후보가 모자라면 못 채운 채 둔다(분야 인기 용어 고정 부착 방지, category 폴백 없음).
// 멱등성: 기존 채움 링크(previousFill)가 여전히 후보면 그 순서를 먼저 두고 모자란 만큼만 보충한다.
const FILL_MIN_SCORE = 4; // 표본(related-quality-sample.md)의 무관 칩은 대부분 0~3점
function fieldFill(term, existing, index, previousFill = [], target = RELATED_TARGET) {
  if (term.relatedFill === false) return []; // 손으로 고른 related만 싣는 용어(채움 금지)
  const need = target - existing.length;
  if (need <= 0 || !term.subcategory) return [];
  const cat = (term.categories || [])[0] || "";
  const skip = new Set([term.slug, ...existing]);
  const pool = new Map();
  for (const t of index.bySub.get(`${cat}|${term.subcategory}`) || []) {
    const s = index.score(term.slug, t.slug);
    if (!skip.has(t.slug) && s >= FILL_MIN_SCORE) pool.set(t.slug, { t, s });
  }
  const kept = previousFill.filter((slug) => pool.has(slug)).slice(0, need);
  const rest = [...pool.keys()].filter((slug) => !kept.includes(slug))
    .sort((x, y) => pool.get(y).s - pool.get(x).s || (x < y ? -1 : 1));
  return [...kept, ...rest].slice(0, need).map((slug) => pool.get(slug).t);
}

/** .related-terms 안에 덧붙일 앵커 줄들 (들여쓰기 4칸, 기존 링크 형식과 동일 + class). */
function fieldFillLines(fillTerms) {
  return fillTerms.map(
    (t) => `    <a href="${escapeHtml(t.slug)}.html" class="related-same-field">${escapeHtml(t.title_ko)}</a>`
  );
}

// ---------- 연구할Lab 단계 링크 ----------

const STAGES = {
  data: { path: "/guide/data-collection", name: "데이터 수집·분석" },
  design: { path: "/guide/methodology", name: "연구 설계" },
  submit: { path: "/guide/submission", name: "윤리·투고" },
  prior: { path: "/guide/prior-research", name: "선행연구 조사" },
};
const CAT_STAGE = { stat: "data", math: "data", method: "design", tool: "design", ethics: "submit" };
const UTM = "utm_source=termglossary&utm_medium=referral&utm_campaign=term-stage";

// 연구방법·통계처럼 단계가 분명한 분야에만 링크를 단다. 나머지는 빈 aside(다른 스크립트의 위치 기준)만 남긴다.
function stageFor(term) {
  return STAGES[CAT_STAGE[(term.categories || [])[0]]] || null;
}

function stageLinkHtml(term) {
  const s = stageFor(term);
  if (!s) return `<aside class="stage-link"></aside>`;
  const href = `https://www.yeonguhallab.kr${s.path}?${UTM}`;
  return (
    `<aside class="stage-link">\n` +
    `  이 용어가 쓰이는 연구 단계 — <a href="${escapeHtml(href)}" target="_blank" rel="noopener">연구할Lab ${escapeHtml(s.name)} 가이드 →</a>\n` +
    `</aside>`
  );
}

module.exports = {
  termLabel,
  shortEn,
  firstSentence,
  shortDefinition,
  buildTermTitle,
  acronymAlias,
  buildTermDescription,
  buildFieldIndex,
  fieldFill,
  fieldFillLines,
  FILL_MIN_SCORE,
  stageFor,
  stageLinkHtml,
  RELATED_TARGET,
};
