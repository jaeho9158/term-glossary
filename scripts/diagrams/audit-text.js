// 도식 글자 배치 감사: 삽입된 모든 도식을 가로·세로 두 판으로 렌더해 측정 가능한 문제를 센다.
//
//   node scripts/diagrams/audit-text.js                 문제 종류·type별 개수 + 예시 slug
//   node scripts/diagrams/audit-text.js --list midword  해당 문제가 있는 slug 전부
//   node scripts/diagrams/audit-text.js --json out.json 문제별 slug 목록 저장
//   node scripts/diagrams/audit-text.js --all           reviewed 여부와 무관하게 모든 스펙
//
// 글자 폭은 렌더러 자신의 근사(core.textWidth)를 쓴다. 브라우저 실측이 아니라 렌더러가
// 스스로 믿는 배치를 검사하는 것이므로, 근사가 틀린 경우(실제 글꼴이 더 넓은 경우)는
// 잡지 못한다. 그 부분은 브라우저에서 따로 본다.
"use strict";
const fs = require("fs");
const path = require("path");
const core = require("./core.js");
const TYPE_MODS = require("./types/index.js");
const { renderSpec } = require("./lib.js");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const PHONE_COL = 343; // 375px 화면의 본문 컬럼
const SEP = /^[·:：—\-–]/;

const PROBLEMS = {
  overflow_box: "글자가 자기 박스 밖으로 넘침",
  overflow_view: "글자가 보기 영역(viewBox) 밖",
  overlap_text: "글자끼리 겹침",
  overlap_other: "글자가 다른 박스·화살표를 가림",
  midword: "단어 중간에서 줄바꿈(노드 라벨·sub)",
  note_midword: "단어 중간에서 줄바꿈(주석)",
  label_run_together: "주석의 '한계' 꼬리표가 문장에 붙어 구분이 없음",
  node_lines_gt2: "노드 라벨이 3줄 이상",
  node_lines_gt3: "노드 전체 줄 수가 4줄 이상",
  line_spacing: "노드 안 같은 크기 줄의 간격이 들쭉날쭉",
  pad_uneven: "노드 위·아래 안쪽 여백 차이가 4px 초과",
  pad_tight: "노드 좌우 여백이 6px 미만",
  note_lines_gt2: "주석이 한 항목에서 3줄 이상으로 감김",
  tiny_on_phone: "휴대폰(343px 컬럼)에서 가장 작은 글자가 9px 미만",
  truncated: "라벨에 말줄임(…)이 있음",
};

// 줄들이 원문의 온전한 줄바꿈 조각(공백·가운뎃점 등 뒤)으로만 끊겼는지
function splitsWord(lines, original) {
  const toks = new Set(core.pieces(original).map((p) => p.t));
  return lines.some((l) => l.split(" ").some((w) => w && !core.pieces(w).every((p) => toks.has(p.t))));
}

function auditOne(spec, title) {
  const mod = TYPE_MODS[spec.type];
  const out = []; // {problem, layout, detail}
  const h = renderSpec(spec, { title, orientation: "h" });
  const v = mod.dual(spec, h.width) ? renderSpec(spec, { title, orientation: "v" }) : null;
  const layouts = [["h", h]];
  if (v) layouts.push(["v", v]);
  const nodeById = new Map((spec.nodes || []).map((n) => [n.id, n]));
  for (const [name, r] of layouts) {
    const add = (problem, detail) => out.push({ problem, layout: name, detail });
    for (const w of r.warnings) {
      if (w.startsWith("박스 넘침")) add("overflow_box", w);
      else if (w.startsWith("보기 영역 밖")) add("overflow_view", w);
      else if (w.startsWith("글자 겹침")) add("overlap_text", w);
      else add("overlap_other", w);
    }
    // 노드별 줄 모으기
    const byOwner = new Map();
    for (const t of r.texts) {
      if (!byOwner.has(t.owner)) byOwner.set(t.owner, []);
      byOwner.get(t.owner).push(t);
    }
    const boxOf = new Map(r.boxes.map((b) => [b.id, b]));
    for (const [owner, ts] of byOwner) {
      const node = nodeById.get(owner);
      if (!node || !boxOf.has(owner)) continue;
      ts.sort((a, b) => a.base - b.base);
      const lab = ts.filter((t) => t.bold);
      const sub = ts.filter((t) => !t.bold);
      if (lab.length && splitsWord(lab.map((t) => t.label), node.label)) add("midword", `라벨 "${node.label}" → ${lab.map((t) => t.label).join("/")}`);
      if (sub.length && node.sub && splitsWord(sub.map((t) => t.label), node.sub)) add("midword", `sub "${node.sub}" → ${sub.map((t) => t.label).join("/")}`);
      if (lab.length > 2) add("node_lines_gt2", `"${node.label}" ${lab.length}줄`);
      if (ts.length > 3) add("node_lines_gt3", `"${node.label}" 전체 ${ts.length}줄`);
      for (const grp of [lab, sub]) {
        const d = grp.slice(1).map((t, i) => t.base - grp[i].base);
        if (d.length && Math.max(...d) - Math.min(...d) > 0.6) add("line_spacing", `"${node.label}" 줄 간격 ${d.map((x) => x.toFixed(1)).join(",")}`);
      }
      const b = boxOf.get(owner);
      const top = ts[0].y - b.y, bot = b.y + b.h - (ts[ts.length - 1].y + ts[ts.length - 1].h);
      if (Math.abs(top - bot) > 4) add("pad_uneven", `"${node.label}" 위 ${top.toFixed(1)} / 아래 ${bot.toFixed(1)}`);
      const side = Math.min(...ts.map((t) => Math.min(t.x - b.x, b.x + b.w - (t.x + t.w))));
      if (side < 6) add("pad_tight", `"${node.label}" 좌우 여백 ${side.toFixed(1)}`);
      if (ts.some((t) => /…|\.\.\./.test(t.label))) add("truncated", `"${node.label}"`);
    }
    // 주석
    const notes = byOwner.get("note") || [];
    const noteTags = byOwner.get("note-tag") || [];
    const noteText = (spec.notes || []).map((n) => n.text);
    if (noteText.length) {
      // 주석 줄을 원문 문장에 대응: 렌더된 줄을 이어 붙여 원문 앞부분과 일치하는 만큼씩 소비
      const lines = notes.slice().sort((a, b) => a.base - b.base || a.x - b.x);
      let i = 0;
      for (const n of spec.notes) {
        const want = n.text.replace(/\s+/g, "");
        let got = "", mine = [];
        while (i < lines.length && got.length < want.length) {
          let s = lines[i].label.replace(/\s+/g, "");
          if (n.tone === "limit" && !got) s = s.replace(/^한계/, "");
          if (n.tone === "pos" && !got) s = s.replace(/^＋/, "");
          got += s; mine.push(lines[i]); i++;
        }
        if (mine.length > 2) add("note_lines_gt2", `"${n.text.slice(0, 24)}…" ${mine.length}줄`);
        if (splitsWord(mine.map((t) => t.label.replace(/^(한계|＋)\s*/, "")), n.text)) add("note_midword", `"${n.text.slice(0, 24)}…"`);
        if (n.tone === "limit") {
          if (!mine.length) continue;
          const first = mine[0].label;
          const tag = noteTags.find((t) => Math.abs(t.base - mine[0].base) < 0.5);
          const joined = /^한계\s+(?![·:：—\-–])\S/.test(first) && !SEP.test(first.replace(/^한계\s*/, ""));
          if (!tag && joined) add("label_run_together", `"${first}"`);
          if (tag && mine[0].x - (tag.x + tag.w) < 5) add("label_run_together", `꼬리표와 본문 간격 ${(mine[0].x - tag.x - tag.w).toFixed(1)}px`);
        }
      }
    }
    // 휴대폰에서의 실효 글자 크기
    const showsOnPhone = !v || name === "v";
    if (showsOnPhone) {
      const scale = Math.min(1, PHONE_COL / r.width);
      const minFs = Math.min(...r.texts.map((t) => t.fs || core.FS));
      if (minFs * scale < 9) add("tiny_on_phone", `${r.width}px 폭, 최소 ${minFs}px → 실효 ${(minFs * scale).toFixed(1)}px`);
    }
  }
  return out;
}

function loadSpecs(all) {
  const manifest = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "diagrams", "inserted.json"), "utf8")));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const titles = new Map(terms.map((t) => [t.slug, t.title_ko]));
  const specs = [];
  for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith(".json"))) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), "utf8"));
    if (all || manifest.has(spec.slug)) specs.push([spec, titles.get(spec.slug)]);
  }
  return specs;
}

function audit(all = false) {
  const res = {}; // problem -> Map(slug -> detail[])
  const total = { figures: 0, byType: {} };
  for (const [spec, title] of loadSpecs(all)) {
    total.figures++;
    total.byType[spec.type] = (total.byType[spec.type] || 0) + 1;
    let found;
    try { found = auditOne(spec, title); } catch (e) { found = [{ problem: "overlap_other", layout: "-", detail: `렌더 예외 ${e.message}` }]; }
    for (const f of found) {
      if (!res[f.problem]) res[f.problem] = new Map();
      if (!res[f.problem].has(spec.slug)) res[f.problem].set(spec.slug, []);
      res[f.problem].get(spec.slug).push(`[${f.layout}] ${f.detail}`);
    }
  }
  return { res, total };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const { res, total } = audit(all);
  const typeOf = new Map();
  for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith(".json"))) {
    const s = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), "utf8"));
    typeOf.set(s.slug, s.type);
  }
  const li = argv.indexOf("--list");
  if (li >= 0) {
    const m = res[argv[li + 1]] || new Map();
    for (const [slug, d] of m) console.log(`${slug}\t${d[0]}`);
    process.exit(0);
  }
  const ji = argv.indexOf("--json");
  if (ji >= 0) {
    const o = {};
    for (const [p, m] of Object.entries(res)) o[p] = [...m.keys()].sort();
    fs.writeFileSync(argv[ji + 1], JSON.stringify(o, null, 1));
  }
  console.log(`도식 ${total.figures}개 (${Object.entries(total.byType).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  for (const [p, desc] of Object.entries(PROBLEMS)) {
    const m = res[p] || new Map();
    const types = {};
    for (const slug of m.keys()) types[typeOf.get(slug)] = (types[typeOf.get(slug)] || 0) + 1;
    console.log(`\n${p.padEnd(20)} ${String(m.size).padStart(5)}  ${desc}`);
    if (m.size) {
      console.log(`    type별: ${Object.entries(types).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      for (const [slug, d] of [...m].slice(0, 3)) console.log(`    예) ${slug}  ${d[0]}`);
    }
  }
}

module.exports = { auditOne, audit, PROBLEMS };
