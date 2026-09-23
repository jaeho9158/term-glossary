// 용어 페이지의 sitemap lastmod 를 "본문이 실제로 바뀐 날"로 유지한다.
//
// 배경: 역링크 삽입·광고 코드·북마크 버튼 같은 일괄 작업이 4만여 페이지를
// 한꺼번에 건드리면 git 최종 커밋일이 전부 같은 날로 찍힌다(2026-09-15~19 에
// 41,333 개 전부). 구글은 그런 lastmod 를 "전 페이지가 바뀜"으로 읽어 우선순위를
// 못 매기고, 사실과 다르다고 판단하면 이후 lastmod 자체를 무시한다.
//
// 방식: <main> 안에서 관련 용어 목록과 이전/다음 페이저를 뺀 본문의 해시를
// data/term-lastmod.json 에 슬러그별로 저장한다. 해시가 같으면 저장된 날짜를
// 그대로 쓰고, 달라졌거나 처음 보는 슬러그면 오늘 날짜로 갱신한다.
// 최초 부트스트랩 값은 파일이 리포에 처음 추가된 날(git --diff-filter=A)이다.
const crypto = require("crypto");

/**
 * 해시 대상 본문만 추출한다. <main> 이 없으면(스텁 등) 파일 전체를 쓴다.
 * 관련 용어 블록과 페이저는 다른 용어가 추가될 때마다 바뀌므로 제외한다.
 */
function extractContentRegion(html) {
  const start = html.indexOf("<main");
  const end = html.lastIndexOf("</main>");
  let region = start !== -1 && end > start ? html.slice(start, end) : html;
  region = region.replace(
    /<h2>관련 용어<\/h2>\s*<div class="related-terms">[\s\S]*?<\/div>/,
    ""
  );
  region = region.replace(/<nav class="term-pager"[\s\S]*?<\/nav>/, "");
  return region.replace(/\s+/g, " ").trim();
}

function hashContent(html) {
  return crypto.createHash("sha1").update(extractContentRegion(html)).digest("hex");
}

/**
 * @param {Record<string,{hash:string,date:string}>} store 저장된 맵 (수정된다)
 * @param {string} slug
 * @param {string} html
 * @param {{today:string, fallbackDate?:string}} opts
 *   fallbackDate: 처음 보는 슬러그에 쓸 날짜(부트스트랩용). 없으면 today.
 * @returns {{date:string, changed:boolean}}
 */
function resolveLastmod(store, slug, html, opts) {
  const hash = hashContent(html);
  const prev = store[slug];
  if (prev && prev.hash === hash && /^\d{4}-\d{2}-\d{2}$/.test(prev.date)) {
    return { date: prev.date, changed: false };
  }
  const date = prev ? opts.today : opts.fallbackDate || opts.today;
  store[slug] = { hash, date };
  return { date, changed: true };
}

module.exports = { extractContentRegion, hashContent, resolveLastmod };
