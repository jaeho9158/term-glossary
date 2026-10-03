// plot 도식용 함수 10개. 스펙은 함수 이름과 매개변수만 쓰고, 점은 여기서 계산한다
// (LLM이 좌표를 찍으면 틀린 그래프가 그대로 거짓 정보가 되므로).
"use strict";

// erf: Abramowitz–Stegun 7.1.26 (최대 오차 1.5e-7)
function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// Φ⁻¹: Acklam 근사(상대 오차 1.2e-9)
function PhiInv(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ln Γ(z): Lanczos(g=7)
function lgamma(z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// params: 이름 → 규칙(gt 초과, gte 이상, lt 미만, ne 같지 않음). domain: 계산할 x 범위.
// desc: 접근성 문장에 쓰는 한국어 이름.
const FNS = {
  normal: { params: { mu: {}, sigma: { gt: 0 } }, desc: "종 모양 분포",
    f: (x, p) => Math.exp(-0.5 * ((x - p.mu) / p.sigma) ** 2) / (p.sigma * Math.sqrt(2 * Math.PI)) },
  t: { params: { df: { gt: 0 } }, desc: "t 분포",
    f: (x, p) => Math.exp(lgamma((p.df + 1) / 2) - lgamma(p.df / 2) - 0.5 * Math.log(p.df * Math.PI) - ((p.df + 1) / 2) * Math.log(1 + (x * x) / p.df)) },
  chi2: { params: { df: { gt: 0 } }, domain: [0, Infinity], desc: "카이제곱 분포",
    f: (x, p) => (x <= 0 ? 0 : Math.exp((p.df / 2 - 1) * Math.log(x) - x / 2 - (p.df / 2) * Math.LN2 - lgamma(p.df / 2))) },
  exponential: { params: { rate: { gt: 0 } }, domain: [0, Infinity], desc: "지수 분포",
    f: (x, p) => p.rate * Math.exp(-p.rate * x) },
  logistic: { params: { x0: {}, k: { ne: 0 } }, desc: "S자 곡선",
    f: (x, p) => 1 / (1 + Math.exp(-p.k * (x - p.x0))) },
  linear: { params: { a: {}, b: {} }, desc: "직선",
    f: (x, p) => p.a * x + p.b },
  // 등분산 이항정규 ROC: d' = √2·Φ⁻¹(AUC), TPR = Φ(Φ⁻¹(FPR) + d')
  roc: { params: { auc: { gte: 0.5, lt: 1 } }, domain: [0, 1], desc: "ROC 곡선",
    f: (x, p) => (x <= 0 ? 0 : x >= 1 ? 1 : Phi(PhiInv(x) + Math.SQRT2 * PhiInv(p.auc))) },
  hill: { params: { ec50: { gt: 0 }, n: { gt: 0 } }, domain: [0, Infinity], desc: "용량-반응 곡선",
    f: (x, p) => (x <= 0 ? 0 : x ** p.n / (p.ec50 ** p.n + x ** p.n)) },
  inverted_u: { params: { peak: {}, width: { gt: 0 } }, desc: "역U자 곡선",
    f: (x, p) => Math.exp(-(((x - p.peak) / p.width) ** 2)) },
  decay: { params: { rate: { gt: 0 } }, domain: [0, Infinity], desc: "감쇠 곡선",
    f: (x, p) => Math.exp(-p.rate * x) },
};

function checkParams(fn, params) {
  const F = Object.prototype.hasOwnProperty.call(FNS, fn) ? FNS[fn] : null;
  if (!F) return [`알 수 없는 plot 함수: ${fn}`];
  const errs = [];
  const given = params && typeof params === "object" ? params : {};
  for (const [k, rule] of Object.entries(F.params)) {
    const v = given[k];
    if (typeof v !== "number" || !Number.isFinite(v)) { errs.push(`${fn}: 매개변수 ${k} 없음 또는 숫자 아님`); continue; }
    const bad = ("gt" in rule && !(v > rule.gt)) || ("gte" in rule && !(v >= rule.gte)) ||
      ("lt" in rule && !(v < rule.lt)) || ("ne" in rule && v === rule.ne);
    if (bad) errs.push(`${fn}: ${k}=${v} 범위 밖`);
  }
  for (const k of Object.keys(given)) if (!Object.prototype.hasOwnProperty.call(F.params, k)) errs.push(`${fn}: 알 수 없는 매개변수 ${k}`);
  return errs;
}

// [lo, hi]를 함수 domain으로 자른 뒤 n개 점을 고르게 뽑는다.
function sample(fn, params, lo, hi, n = 121) {
  const F = Object.prototype.hasOwnProperty.call(FNS, fn) ? FNS[fn] : null;
  const d = F.domain || [-Infinity, Infinity];
  const a = Math.max(lo, d[0]), b = Math.min(hi, d[1]);
  const pts = [];
  if (!(a < b)) return pts;
  for (let i = 0; i < n; i++) {
    const x = a + ((b - a) * i) / (n - 1);
    pts.push([x, F.f(x, params)]);
  }
  return pts;
}

module.exports = { FNS, Phi, PhiInv, lgamma, checkParams, sample };
