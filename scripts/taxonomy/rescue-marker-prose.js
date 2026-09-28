// 개념 계통 마커(concept-family / concept-path) 안에 잘못 들어간 본문 문장을 마커 밖으로 옮긴다.
//
//   node scripts/taxonomy/rescue-marker-prose.js            옮기기
//   node scripts/taxonomy/rescue-marker-prose.js --dry-run  옮길 페이지 수·예시만 출력
//
// build.js는 마커 사이를 통째로 다시 쓰므로, 본문 보강 스크립트가 "관련 용어 앞 마지막 </p>"에
// 문장을 덧붙이다 <p class="concept-family-map"> 안(링크 뒤)에 넣은 경우 그 문장이 지워진다.
// 생성 마크업(링크·라벨·제목) 밖의 텍스트를 찾아 블록 바로 앞 줄에 일반 <p>로 옮긴다
// (원래 덧붙이려던 직전 절 — 보통 '주의할 점' — 끝에 붙는다).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const BLOCK = /([ \t]*)(<!-- concept-(family|path):start -->)([\s\S]*?)(<!-- concept-\3:end -->)/g;

// 생성 마크업만 남기고 지웠을 때 남는 텍스트가 있으면 '여분'이다.
const leftover = (inner) => inner
  .replace(/<a [^>]*>[^<]*<\/a>/g, "").replace(/<span[^>]*>[^<]*<\/span>/g, "")
  .replace(/<h2[^>]*>[^<]*<\/h2>/g, "").replace(/<[^>]+>/g, "").trim();

// 반환: { html, moved: [문장...] }. 옮길 것이 없으면 html 그대로.
function rescue(html) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const moved = [];
  const out = html.replace(BLOCK, (all, indent, start, kind, inner, end) => {
    if (!leftover(inner)) return all;
    let clean = inner;
    const extras = [];
    // 알려진 모양: 지도 링크 뒤에 붙은 문장
    clean = clean.replace(/(<p class="concept-family-map"><a [^>]*>[^<]*<\/a>)([\s\S]*?)(<\/p>)/, (m, a, extra, c) => {
      if (extra.trim()) extras.push(extra.trim());
      return a + c;
    });
    // 그 밖: </section>·</nav> 뒤, 마커 끝 앞에 붙은 것
    clean = clean.replace(/(<\/(?:section|nav)>)([\s\S]+)$/, (m, c, extra) => {
      if (extra.trim()) extras.push(extra.trim());
      return c;
    });
    if (leftover(clean)) throw new Error("알 수 없는 모양의 여분 텍스트: " + leftover(clean).slice(0, 80));
    moved.push(...extras);
    const paras = extras.map((e) => (/^<(p|div|ul|ol)[\s>]/.test(e) ? e : `<p>${e}</p>`));
    return paras.map((p) => `${indent || "  "}${p}${nl}`).join("") + indent + start + clean + end;
  });
  return { html: out, moved };
}

function run() {
  const dry = process.argv.includes("--dry-run");
  const dir = path.join(ROOT, "terms");
  const done = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    const file = path.join(dir, f);
    const html = fs.readFileSync(file, "utf8");
    const r = rescue(html);
    if (!r.moved.length) continue;
    done.push([f, r.moved[0]]);
    if (!dry) fs.writeFileSync(file, r.html, "utf8");
  }
  console.log(`${dry ? "[dry-run] " : ""}옮긴 페이지 ${done.length}`);
  for (const [f, s] of done.slice(0, 3)) console.log(`  ${f}: ${s.slice(0, 70)}…`);
}

if (require.main === module) run();
module.exports = { rescue };
