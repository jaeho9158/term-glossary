// 용어 페이지 메타 공통 규칙 — JSON-LD(DefinedTerm+BreadcrumbList), Open Graph/Twitter, 최종 수정 줄.
// insert-term-meta.js(일괄 적용)와 build-term-page.js(신규 생성)가 같은 빌더를 쓴다.
// 마커 주석으로 감싸 재실행해도 중복 없이 교체된다(멱등).
const { escapeHtml } = require("../../assets/escape.js");

const SITE_URL = "https://termglossary.kr/";
const SITE_NAME = "논문용어사전";
const OG_IMAGE = SITE_URL + "assets/og-default.png";

const HEAD_RE = /<!-- term-meta:start -->[\s\S]*?<!-- term-meta:end -->\n?/g;
const UPDATED_RE = /<!-- term-updated:start -->[\s\S]*?<!-- term-updated:end -->\n?/g;
const STAGE_MARK = '<aside class="stage-link">';

function clean(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

// 코드포인트 기준으로 자르고, 잘리면 …를 붙인다(총 길이 max 이하).
function truncate(s, max) {
  const chars = Array.from(clean(s));
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}

// <script> 안에서 안전하도록 JSON 직렬화: "</" → "<\/", "<!--" 및 줄 구분자 이스케이프.
const BS = String.fromCharCode(92);
function safeJson(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\!--")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), () => BS + "u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), () => BS + "u2029");
}

function termUrl(slug) {
  return `${SITE_URL}terms/${slug}.html`;
}

function buildJsonLd(term, opts = {}) {
  const { categoryLabels = {}, date } = opts;
  const url = termUrl(term.slug);
  const name = clean(term.title_ko);
  const alts = [];
  for (const a of [term.title_en, ...(term.aliases || [])]) {
    const v = clean(a);
    if (v && v !== name && !alts.includes(v)) alts.push(v);
  }
  const defined = {
    "@type": "DefinedTerm",
    "@id": url + "#term",
    name,
    description: truncate(term.definition, 300),
    url,
    inDefinedTermSet: { "@type": "DefinedTermSet", name: SITE_NAME, url: SITE_URL },
  };
  if (alts.length) defined.alternateName = alts.length === 1 ? alts[0] : alts;
  if (date) defined.dateModified = date;

  const items = [{ name: "홈", item: SITE_URL }];
  const cat = (term.categories || [])[0];
  if (cat) {
    items.push({
      name: categoryLabels[cat] || cat,
      item: `${SITE_URL}category.html?cat=${encodeURIComponent(cat)}`,
    });
  }
  items.push({ name, item: url });
  const crumbs = {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
  return { "@context": "https://schema.org", "@graph": [defined, crumbs] };
}

function metaTag(attr, key, value) {
  return `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
}

// OG/Twitter 태그 목록. skip: 이미 페이지에 있는 키(property/name) 집합.
function buildSocialTags(o, skip = new Set()) {
  const tags = [
    ["property", "og:type", o.type || "article"],
    ["property", "og:site_name", SITE_NAME],
    ["property", "og:title", o.title],
    ["property", "og:description", truncate(o.description, 150)],
    ["property", "og:url", o.url],
    ["property", "og:locale", "ko_KR"],
    ["property", "og:image", OG_IMAGE],
    ["name", "twitter:card", "summary_large_image"],
  ];
  return tags.filter(([, k]) => !skip.has(k)).map(([a, k, v]) => metaTag(a, k, v));
}

function buildHeadBlock(term, opts = {}) {
  const { categoryLabels, date } = opts;
  const ld = buildJsonLd(term, { categoryLabels, date });
  const social = buildSocialTags({
    type: "article",
    title: `${clean(term.title_ko)} (${clean(term.title_en)}) - ${SITE_NAME}`,
    description: term.definition,
    url: termUrl(term.slug),
  });
  return [
    "<!-- term-meta:start -->",
    `<script type="application/ld+json">${safeJson(ld)}</script>`,
    ...social,
    "<!-- term-meta:end -->",
  ].join("\n");
}

// 화면의 "최종 수정" 줄은 쓰지 않는다(사용자 결정 2026-10-04). 이전에 넣은 줄은 UPDATED_RE로 지운다.
// 수정일은 JSON-LD의 dateModified로만 남는다.
function buildUpdatedLine() {
  return "";
}

function isStub(html) {
  return /noindex/i.test(html) && /http-equiv="refresh"/i.test(html);
}

function stripTermMeta(html) {
  return html.replace(HEAD_RE, "").replace(UPDATED_RE, "");
}

// 용어 페이지 HTML에 메타를 (재)적용한다. 스텁/구조 불일치면 null.
function applyTermMeta(html, term, opts = {}) {
  if (isStub(html)) return null;
  let out = stripTermMeta(html);
  if (!out.includes("</head>") || !out.includes(STAGE_MARK)) return null;
  const head = buildHeadBlock(term, opts);
  out = out.replace("</head>", () => head + "\n</head>");
  const line = buildUpdatedLine(opts.date);
  if (line) out = out.replace(STAGE_MARK, () => line + "\n" + STAGE_MARK);
  return out;
}

function attrOf(html, re) {
  const m = html.match(re);
  return m ? m[1] : "";
}

function unescapeAttr(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// 최상위 페이지(index/category/viewer/about): 기존 <title>/description/canonical을 재사용,
// 이미 있는 OG 키는 건드리지 않고 빠진 것만 마커 블록으로 추가.
function applyPageMeta(html) {
  const out = html.replace(HEAD_RE, "");
  if (!out.includes("</head>")) return null;
  const title = unescapeAttr(attrOf(out, /<title>([\s\S]*?)<\/title>/));
  const description = unescapeAttr(attrOf(out, /<meta name="description" content="([^"]*)"/));
  const url = attrOf(out, /<link rel="canonical" href="([^"]*)"/);
  if (!title || !url) return null;
  const present = new Set();
  for (const m of out.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)"/g)) present.add(m[1]);
  const tags = buildSocialTags({ type: "website", title, description, url }, present);
  if (!tags.length) return out;
  const block = ["<!-- term-meta:start -->", ...tags, "<!-- term-meta:end -->"].join("\n");
  return out.replace("</head>", () => block + "\n</head>");
}

module.exports = {
  SITE_URL, OG_IMAGE,
  truncate, safeJson, buildJsonLd, buildSocialTags, buildHeadBlock, buildUpdatedLine,
  isStub, stripTermMeta, applyTermMeta, applyPageMeta,
};
