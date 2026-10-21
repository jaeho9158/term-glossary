// 도해 SVG의 글자가 viewBox 안에 들어오는지 추정해 위반 목록을 돌려준다(글자 폭은 엔진의 근사 측정).
"use strict";
const { estimateTextWidth } = require("../svg-illus/src/index.js");
function outOfBounds(svg) {
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const W = +vb[1], H = +vb[2], bad = [];
  for (const m of svg.matchAll(/<text ([^>]*)>([\s\S]*?)<\/text>/g)) {
    const a = m[1], x = +(a.match(/\bx="([-\d.]+)"/) || [])[1], y = +(a.match(/\by="([-\d.]+)"/) || [])[1];
    const size = +((a.match(/font-size="([\d.]+)"/) || [])[1] || 13), anchor = (a.match(/text-anchor="(\w+)"/) || [])[1] || "start";
    const text = m[2].replace(/<[^>]+>/g, "");
    const w = estimateTextWidth(text, size);
    const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    if (x0 < 0 || x0 + w > W || y - size < 0 || y + size * 0.3 > H) bad.push(`${text} (x ${Math.round(x0)}~${Math.round(x0 + w)} / ${W}, y ${y} / ${H})`);
  }
  return bad;
}
module.exports = { outOfBounds };
