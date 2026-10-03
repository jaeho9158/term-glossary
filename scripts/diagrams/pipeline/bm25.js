// 작은 BM25. 한글은 음절 2-gram(형태소 분석 없이도 "미세아교"↔"미세아교세포"가 맞물린다),
// 영문·숫자는 2글자 이상 낱말.
"use strict";

function tokens(s) {
  const out = [];
  for (const m of String(s).toLowerCase().matchAll(/[가-힣]+|[a-z0-9]+/g)) {
    const w = m[0];
    if (/[가-힣]/.test(w)) {
      if (w.length === 1) out.push(w);
      for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
    } else if (w.length >= 2) out.push(w);
  }
  return out;
}

class BM25 {
  constructor(docs, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map((d) => {
      const tf = new Map();
      const tk = tokens(d.text);
      for (const t of tk) tf.set(t, (tf.get(t) || 0) + 1);
      return { id: d.id, tf, len: tk.length, meta: d.meta };
    });
    this.N = this.docs.length;
    this.avg = this.docs.reduce((s, d) => s + d.len, 0) / (this.N || 1);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }
  idf(t) {
    const n = this.df.get(t) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }
  // 점수 내림차순, 같으면 id 오름차순(결과 재현). filter를 통과한 문서만.
  search(query, { k = 3, filter = () => true } = {}) {
    const q = [...new Set(tokens(query))];
    const hits = [];
    for (const d of this.docs) {
      if (!filter(d)) continue;
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        s += (this.idf(t) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avg));
      }
      if (s > 0) hits.push({ id: d.id, score: s, meta: d.meta });
    }
    return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, k);
  }
}

module.exports = { tokens, BM25 };
