// 도해 삽입: 위치, 멱등성, 마커, 다른 블록과의 공존, 라이선스·출처 표기
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { START, END, validate, renderFigure, applyIllus, removeIllus, loadAll } = require("../scripts/illus/insert.js");
const { applyDiagram, removeDiagram } = require("../scripts/diagrams/insert.js");
const { build } = require("../scripts/illus/build-svg.js");

const ROOT = path.join(__dirname, "..");
const page = (nl = "\n") => ["<main>", "  <h1>용어</h1>", '  <div class="definition-box">', "    <strong>한 줄 정의:</strong> 설명", "  </div>", "", "  <h2>쉽게 풀면</h2>", "  <!-- term-extras:sections:start -->", "  <h2>핵심 정리</h2>", "  <!-- term-extras:sections:end -->", "</main>"].join(nl);
const commons = {
  slug: "x", title: "엑스", method: "commons", caption: "설명", alt: "엑스: 설명",
  image: { src: "assets/illus/x.jpg", width: 800, height: 600 },
  credit: { author: "Someone", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:X.jpg", kind: "commons" },
};
const svgData = { slug: "y", title: "와이", method: "svg", caption: "도해", svg: "assets/illus/y.svg", sources: ["https://en.wikipedia.org/wiki/Y"], credit: { author: "논문용어사전", kind: "original" }, legend: [{ kind: "var", symHtml: "<i>θ</i>", desc: "각" }] };
const SVG = '<svg viewBox="0 0 10 10"><title>도해</title></svg>';
const count = (s, re) => (s.match(re) || []).length;

test("정의 박스 뒤에 넣고, 재실행해도 같다(LF·CRLF)", () => {
  for (const nl of ["\n", "\r\n"]) {
    const inner = renderFigure(commons);
    const once = applyIllus(page(nl), inner);
    assert.ok(once.indexOf(START) > once.indexOf("definition-box") && once.indexOf(START) < once.indexOf("쉽게 풀면"));
    assert.strictEqual(applyIllus(once, inner), once, "멱등이어야 함");
    assert.strictEqual(count(once, /term-illus:start/g), 1);
    if (nl === "\r\n") assert.ok(!/[^\r]\n/.test(once), "CRLF 유지");
    // 다른 내용이면 마커 사이만 교체
    const twice = applyIllus(once, renderFigure({ ...commons, caption: "바뀜" }));
    assert.strictEqual(count(twice, /term-illus:start/g), 1);
    assert.ok(twice.includes("바뀜") && !twice.includes(">설명<"));
    assert.strictEqual(twice.replace(/<!-- term-illus:start -->[\s\S]*<!-- term-illus:end -->/, ""), once.replace(/<!-- term-illus:start -->[\s\S]*<!-- term-illus:end -->/, ""));
    // 제거하면 원래 페이지
    assert.strictEqual(removeIllus(once), page(nl));
  }
});

test("도식 블록이 있으면 그 뒤에 넣고, 도식 재삽입·제거가 도해를 건드리지 않는다", () => {
  const withDiagram = applyDiagram(page(), '<figure class="concept-diagram">D</figure>');
  const both = applyIllus(withDiagram, renderFigure(commons));
  assert.ok(both.indexOf(START) > both.indexOf("<!-- concept-diagram:end -->"));
  const re = applyDiagram(both, '<figure class="concept-diagram">D2</figure>');
  assert.ok(re.includes(START) && re.includes(END) && re.includes("D2"));
  assert.strictEqual(count(re, /term-illus:start/g), 1);
  const gone = removeDiagram(both);
  assert.ok(gone.includes(START) && !gone.includes("concept-diagram"));
  // 나중에 도식이 생겨도 정의 → 도식 → 도해 순서
  const late = applyDiagram(applyIllus(page(), renderFigure(commons)), '<figure class="concept-diagram">L</figure>');
  assert.ok(late.indexOf("concept-diagram:start") < late.indexOf(START));
  // 도해 삽입은 term-extras 블록과 도식 블록을 그대로 둔다
  assert.strictEqual(removeIllus(both), withDiagram);
  assert.ok(both.includes("<!-- term-extras:sections:start -->") && both.includes("<!-- term-extras:sections:end -->"));
});

test("정의 박스가 없으면 null", () => {
  assert.strictEqual(applyIllus("<main><h1>x</h1></main>", renderFigure(commons)), null);
});

test("공용 그림: lazy 로딩, 출처·라이선스 표기", () => {
  const h = renderFigure(commons);
  assert.ok(/<img [^>]*loading="lazy"/.test(h) && /width="800" height="600"/.test(h));
  assert.ok(h.includes('href="https://commons.wikimedia.org/wiki/File:X.jpg"') && h.includes("CC BY-SA 4.0") && h.includes('rel="license noopener"'));
  assert.ok(h.includes('class="si-figure"') && h.includes('data-kind="illus"') && !h.includes("term-figure") && !h.includes('class="term-illus"'));
});

test("라이선스 필드 누락·허용 밖 라이선스는 거부", () => {
  for (const bad of [{ license: undefined }, { licenseUrl: undefined }, { pageUrl: undefined }, { author: "" }, { license: "CC BY-NC-SA 4.0" }, { license: "CC BY-ND 4.0" }, { license: "Apache License 2.0" }]) {
    const d = { ...commons, credit: { ...commons.credit, ...bad } };
    assert.ok(validate(d).length > 0, JSON.stringify(bad));
    assert.throws(() => renderFigure(d));
  }
  assert.deepStrictEqual(validate({ ...commons, credit: { ...commons.credit, license: "CC0", licenseUrl: undefined } }), []);
});

test("코드 SVG: 인라인, 기호 설명, 대조 출처", () => {
  const h = renderFigure(svgData, SVG);
  assert.ok(h.includes("<svg ") && h.includes('class="illus-legend"') && h.includes("<i>θ</i>") && h.includes("en.wikipedia.org/wiki/Y"));
  assert.throws(() => renderFigure({ ...svgData, sources: [] }, SVG));
  assert.throws(() => renderFigure(svgData, "<div></div>"));
});

test("저장소 데이터: 모두 유효하고 그림 파일이 있으며, 반영된 페이지에 블록이 한 번씩 있다", () => {
  const all = loadAll();
  assert.ok(all.length >= 1);
  for (const d of all) {
    assert.deepStrictEqual(validate(d), [], d.slug);
    const asset = path.join(ROOT, d.method === "svg" ? d.svg : d.image.src);
    assert.ok(fs.existsSync(asset), asset);
    const html = fs.readFileSync(path.join(ROOT, "terms", d.slug + ".html"), "utf8");
    assert.strictEqual(count(html, /<!-- term-illus:start -->/g), 1, d.slug);
    assert.strictEqual(count(html, /<!-- term-illus:end -->/g), 1, d.slug);
    const svg = d.method === "svg" ? fs.readFileSync(asset, "utf8") : null;
    const specFile = path.join(ROOT, "data", "illus", "specs", d.slug + ".json");
    const spec = d.method === "svg" ? JSON.parse(fs.readFileSync(specFile, "utf8")) : null;
    assert.strictEqual(applyIllus(html, renderFigure(d, svg, spec)), html, d.slug + " 재실행 시 바뀌면 안 됨");
    if (d.method === "svg") {
      assert.ok(html.includes("CC BY 4.0") && html.includes("creativecommons.org/licenses/by/4.0"), d.slug + " CC BY 4.0 표기");
      assert.strictEqual(build(spec), svg, d.slug + ": assets/illus SVG가 스펙과 다름(node scripts/illus/build-svg.js)");
    }
    if (d.method === "commons") assert.ok(html.includes(d.credit.pageUrl) && html.includes(d.credit.license), d.slug + " 출처 표기");
  }
});

test("vector-projection 범례는 벡터 기호이고 color-wheel 범례(HSL·보색)가 아니다", () => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "illus", "specs", "vector-projection.json"), "utf8"));
  const syms = spec.legend.map((x) => x.sym || "").join("|");
  assert.ok(syms.includes("proj_{b} a") && !/HSL|보색/.test(syms));
  const html = fs.readFileSync(path.join(ROOT, "terms", "vector-projection.html"), "utf8");
  assert.ok(html.includes("정사영(projection)") && !html.slice(html.indexOf("term-illus:start"), html.indexOf("term-illus:end")).includes("HSL"));
});

test("코드 SVG 스펙 154개: 모두 렌더되고 라벨 겹침이 남지 않는다", () => {
  const { renderSVG, templates } = require("../scripts/svg-illus/src/index.js");
  const dir = path.join(ROOT, "data", "illus", "specs");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.strictEqual(files.length, 154);
  for (const f of files) {
    const r = renderSVG(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), { templates });
    assert.deepStrictEqual(r.report.unresolved, [], f);
  }
});

test("코드 SVG 154개: 글자가 viewBox 안에 있고 노트가 한 번만 나온다", () => {
  const { outOfBounds } = require("../scripts/illus/check-bounds.js");
  for (const d of loadAll().filter((x) => x.method === "svg")) {
    const svg = fs.readFileSync(path.join(ROOT, d.svg), "utf8");
    assert.deepStrictEqual(outOfBounds(svg), [], d.slug);
    const html = fs.readFileSync(path.join(ROOT, "terms", d.slug + ".html"), "utf8");
    const block = html.slice(html.indexOf("term-illus:start"), html.indexOf("term-illus:end"));
    const notes = [...block.matchAll(/<p class="(?:illus|si)-note">([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").slice(0, 25));
    assert.strictEqual(new Set(notes).size, notes.length, d.slug + " 노트 중복");
    assert.ok(!/data-kind="illus"] .si-frame svg { min-width: 440px/.test(fs.readFileSync(path.join(ROOT, "assets", "term-illus.css"), "utf8")), "가로 스크롤 최소 폭 금지");
  }
});
