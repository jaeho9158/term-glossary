// 용어 페이지 SEO 공통 규칙 — title/description, 같은 분야 관련 용어 채우기, 연구할Lab 단계 링크.
// build-term-page.js(신규 생성), generate-related-html.js(관련 용어 재렌더),
// apply-term-seo.js(기존 산출물 일괄 적용)가 모두 이 모듈을 쓴다 — 규칙이 한 곳에만 있어야
// 다음 재생성 때 서로 다른 결과로 되돌아가지 않는다.
const { escapeHtml } = require("../../assets/escape.js");

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

const TITLE_DEF_MIN = 12;

/**
 * title: `한글명(영문명) 뜻 - 한 줄 정의… | 논문용어사전`, 60자 안.
 * 넘치면 (1) 정의를 12자까지 줄이고 (2) 그래도 넘치면 영문명을 빼고 정의를 남기며
 * (3) 그래도 넘치면 정의를 뺀다. 검색어인 "한글명 뜻"은 항상 맨 앞에 남는다 — 검색 결과에서
 * 정의 미리보기가 CTR을 좌우하므로 영문명보다 정의를 우선 지킨다.
 */
function buildTermTitle(term) {
  const tail = ` | ${SITE}`;
  const ko = clean(term.title_ko);
  const heads = [`${termLabel(term, true)} 뜻`];
  if (ko && `${ko} 뜻` !== heads[0]) heads.push(`${ko} 뜻`);
  const def = clean(term.definition);
  for (const head of heads) {
    const budget = Math.min(TITLE_DEF_MAX, TITLE_MAX - head.length - tail.length - 3);
    if (def && budget >= TITLE_DEF_MIN) {
      const d = shortDefinition(def, budget);
      if (d && d !== "…") return `${head} - ${d}${tail}`;
    }
  }
  for (const head of heads) {
    if (head.length + tail.length <= TITLE_MAX) return `${head}${tail}`;
  }
  return `${heads[heads.length - 1]}${tail}`;
}

function buildTermDescription(term) {
  const tailShort = ` 쉬운 풀이, 논문 예문과 관련 용어까지 - ${SITE}`;
  const field = clean(term.subcategory);
  const tailLong = ` ${field ? field + " 분야 용어 " : ""}${termLabel(term)}의 뜻을 쉬운 풀이와 논문 예문, 관련 용어까지 정리했습니다 - ${SITE}`;
  const def = clean(term.definition);
  const first = firstSentence(def);
  let body = first;
  // 첫 문장이 짧으면 정의의 다음 문장을 이어 붙인다.
  if (body.length + tailShort.length < DESC_MIN && def.length > first.length) {
    body = def;
  }
  let tail = body.length + tailShort.length < DESC_MIN ? tailLong : tailShort;
  if (body.length + tail.length < DESC_MIN) tail = tailLong;
  if (tail === tailLong && tail.length > DESC_MAX - 40) tail = tailShort;
  const room = DESC_MAX - tail.length;
  if (body.length > room) {
    let cut = body.slice(0, room - 1);
    const sp = cut.lastIndexOf(" ");
    if (sp >= room * 0.6) cut = cut.slice(0, sp);
    body = cut.replace(/[\s,·(.]+$/, "") + "…";
  }
  return (body + tail).trim();
}

// ---------- 같은 분야 관련 용어 ----------

/** terms 전체로 분야 색인을 만든다: 인용 수 내림차순 → slug 오름차순. */
function buildFieldIndex(terms) {
  const cited = new Map();
  for (const t of terms) for (const s of t.related || []) cited.set(s, (cited.get(s) || 0) + 1);
  const order = [...terms].sort(
    (a, b) => (cited.get(b.slug) || 0) - (cited.get(a.slug) || 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  );
  const bySub = new Map();
  const byCat = new Map();
  for (const t of order) {
    const cat = (t.categories || [])[0] || "";
    const subKey = `${cat}|${t.subcategory || ""}`;
    if (t.subcategory) {
      if (!bySub.has(subKey)) bySub.set(subKey, []);
      bySub.get(subKey).push(t);
    }
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(t);
  }
  return { bySub, byCat };
}

/** 기존 링크(existing slug 배열)를 두고 같은 subcategory → 같은 1차 category 순으로 채울 용어들. */
function fieldFill(term, existing, index, target = RELATED_TARGET) {
  const need = target - existing.length;
  if (need <= 0) return [];
  const skip = new Set([term.slug, ...existing]);
  const cat = (term.categories || [])[0] || "";
  const pools = [];
  if (term.subcategory) pools.push(index.bySub.get(`${cat}|${term.subcategory}`) || []);
  pools.push(index.byCat.get(cat) || []);
  const out = [];
  for (const pool of pools) {
    for (const t of pool) {
      if (out.length >= need) return out;
      if (skip.has(t.slug)) continue;
      skip.add(t.slug);
      out.push(t);
    }
  }
  return out;
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

function stageFor(term) {
  return STAGES[CAT_STAGE[(term.categories || [])[0]] || "prior"];
}

function stageLinkHtml(term) {
  const s = stageFor(term);
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
  buildTermDescription,
  buildFieldIndex,
  fieldFill,
  fieldFillLines,
  stageFor,
  stageLinkHtml,
  RELATED_TARGET,
};
