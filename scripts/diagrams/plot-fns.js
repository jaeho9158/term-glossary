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
  // x=0: df>2면 0, df=2면 1/2, df<2면 발산(Infinity — sample이 끝점을 살짝 피한다)
  chi2: { params: { df: { gt: 0 } }, domain: [0, Infinity], desc: "카이제곱 분포",
    f: (x, p) => (x < 0 ? 0 : x === 0 ? (p.df > 2 ? 0 : p.df === 2 ? 0.5 : Infinity)
      : Math.exp((p.df / 2 - 1) * Math.log(x) - x / 2 - (p.df / 2) * Math.LN2 - lgamma(p.df / 2))) },
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
  // ── 추가 함수 9개(plot-ext.json 제안 7 + km_function·mixing_free_energy). scripts/svg-illus/src/diagram/plot-fns.js 와 같게 유지 ──
  power: { params: { a: { gt: 0 }, b: {} }, domain: [0, Infinity], desc: "거듭제곱 곡선",
    f: (x, p) => p.a * x ** p.b },
  reciprocal: { params: { k: { gt: 0 }, c: {} }, domain: [0, Infinity], desc: "반비례 곡선",
    f: (x, p) => (x <= 0 ? Infinity : p.k / x + p.c) },
  // 전망 이론 가치 함수: 이득 x^α, 손실 −λ(−x)^β
  prospect_value: { params: { alpha: { gt: 0 }, beta: { gt: 0 }, lambda: { gt: 0 } }, desc: "가치 함수(전망 이론)",
    f: (x, p) => (x >= 0 ? x ** p.alpha : -p.lambda * (-x) ** p.beta) },
  // 펌프 양정 H0 − aQ²(branch 0)와 계통 저항 Hs + kQ²(branch 1). series 두 개로 그리면 교점이 운전점
  quadratic_pair: { params: { H0: { gt: 0 }, a: { gt: 0 }, Hs: { gte: 0 }, k: { gt: 0 }, branch: { gte: 0, lt: 2 } }, domain: [0, Infinity], desc: "펌프·계통 곡선",
    f: (x, p) => (p.branch >= 1 ? p.Hs + p.k * x * x : p.H0 - p.a * x * x) },
  // 카플란-마이어 계단: S(t) = Π_{t_i ≤ t} (1 − d_i/n_i)
  step_survival: { params: { times: { arr: true }, events: { arr: true }, atRisk: { arr: true } }, domain: [0, Infinity], desc: "생존 곡선(계단)",
    f: (x, p) => { let s = 1; p.times.forEach((t, i) => { if (t <= x && p.atRisk[i] > 0) s *= 1 - p.events[i] / p.atRisk[i]; }); return s; } },
  // 1구획 경구 투여 혈중 농도: scale·ka/(ka−ke)·(e^(−ke t) − e^(−ka t))
  concentration_time: { params: { ka: { gt: 0 }, ke: { gt: 0 }, scale: { gt: 0 } }, domain: [0, Infinity], desc: "혈중 농도-시간 곡선",
    f: (x, p) => (Math.abs(p.ka - p.ke) < 1e-12 ? p.scale * p.ka * x * Math.exp(-p.ke * x) : p.scale * p.ka / (p.ka - p.ke) * (Math.exp(-p.ke * x) - Math.exp(-p.ka * x))) },
  // 비례위험: 가로축 공변량 x, h = h0·exp(βx)
  cox_hazard: { params: { beta: {}, h0: { gt: 0 } }, desc: "비례위험 곡선",
    f: (x, p) => p.h0 * Math.exp(p.beta * x) },
  // 쿠벨카-뭉크 함수 K/S = (1−R)²/(2R). 가로축 R(반사율, 0<R≤1)
  km_function: { params: {}, domain: [0.001, 1], desc: "쿠벨카-뭉크 함수",
    f: (x) => (1 - x) ** 2 / (2 * x) },
  // 플로리-허긴스 혼합 자유에너지 ΔG/kT = (φ/N1)lnφ + ((1−φ)/N2)ln(1−φ) + χφ(1−φ). 가로축 φ(0<φ<1)
  mixing_free_energy: { params: { N1: { gt: 0 }, N2: { gt: 0 }, chi: {} }, domain: [0.001, 0.999], desc: "혼합 자유에너지 곡선",
    f: (x, p) => (x / p.N1) * Math.log(x) + ((1 - x) / p.N2) * Math.log(1 - x) + p.chi * x * (1 - x) },
  // 감쇠 없는 불균형 응답비 r/e = x²/|1−x²|, 가로축 x=Ω/ω (x=1 공진에서 발산하므로 표시용으로 분모 하한 0.05를 둔다)
  unbalance_response: { params: {}, domain: [0, Infinity], desc: "불균형 응답비 곡선",
    f: (x) => (x * x) / Math.max(Math.abs(1 - x * x), 0.05) },
  // 라플라스 분포 밀도 exp(−|x−mu|/b)/(2b)
  laplace: { params: { mu: {}, b: { gt: 0 } }, desc: "라플라스 분포 곡선",
    f: (x, p) => Math.exp(-Math.abs(x - p.mu) / p.b) / (2 * p.b) },
  // 제어봉 미분가 sin²(πx), 가로축 x=z/H (0≤x≤1)
  sin_squared: { params: {}, domain: [0, 1], desc: "미분제어봉가 곡선",
    f: (x) => Math.sin(Math.PI * x) ** 2 },
  // 제어봉 적분가(누적 비율) x − sin(2πx)/(2π), 가로축 x=z/H
  cumulative_sin_squared: { params: {}, domain: [0, 1], desc: "적분제어봉가 곡선",
    f: (x) => x - Math.sin(2 * Math.PI * x) / (2 * Math.PI) },
  // Page 건조 모형 MR = exp(−k·t^n)
  stretched_exp: { params: { k: { gt: 0 }, n: { gt: 0 } }, domain: [0, Infinity], desc: "Page 건조 곡선",
    f: (x, p) => Math.exp(-p.k * x ** p.n) },
  // 2차계 자유 응답 exp(−ζωn t)·cos(ωn√(1−ζ²) t), 0≤ζ<1
  damped_oscillation: { params: { zeta: { gte: 0, lt: 1 }, wn: { gt: 0 } }, domain: [0, Infinity], desc: "감쇠 진동 곡선",
    f: (x, p) => Math.exp(-p.zeta * p.wn * x) * Math.cos(p.wn * Math.sqrt(1 - p.zeta * p.zeta) * x) },
  // ── 추가 12개(round4 plot-ext, 본문 수치로 검증): bet·binomial_pmf·saturation_exp·birthday_collision·planck·log·arrhenius_ratio·complement_power·gain_amplification·poisson·bose_einstein·cohesive_triangle ──
  // BET 흡착등온식 v = vm·c·x/((1−x)(1−x+cx)), 가로축 x=P/P0 (0≤x<1)
  bet: { params: { vm: { gt: 0 }, c: { gt: 0 } }, domain: [0, 0.999], desc: "BET 흡착등온선",
    f: (x, p) => (p.vm * p.c * x) / ((1 - x) * (1 - x + p.c * x)) },
  // 이항분포 확률 P(X=k)=C(n,k)p^k(1−p)^(n−k). 이산 분포라 가로축 x를 가장 가까운 정수 k로 반올림한 막대 높이(계단)로 그린다
  binomial_pmf: { params: { n: { gt: 0 }, p: { gt: 0, lt: 1 } }, domain: [0, Infinity], desc: "이항분포 확률",
    f: (x, p) => { const k = Math.round(x), n = Math.round(p.n); return k < 0 || k > n ? 0 : Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p.p) + (n - k) * Math.log(1 - p.p)); } },
  // 포화 곡선 y = L0(1 − e^(−kx)) (BOD 일차 반응 등)
  saturation_exp: { params: { L0: { gt: 0 }, k: { gt: 0 } }, domain: [0, Infinity], desc: "포화 곡선",
    f: (x, p) => p.L0 * (1 - Math.exp(-p.k * x)) },
  // 생일 문제 P(n)=1−d!/((d−n)!·d^n). 정수 n의 값을 감마 함수로 매끄럽게 이은 곡선(n≥d이면 1)
  birthday_collision: { params: { d: { gt: 0 } }, domain: [0, Infinity], desc: "생일 충돌 확률 곡선",
    f: (x, p) => (x <= 0 ? 0 : x >= p.d ? 1 : 1 - Math.exp(lgamma(p.d + 1) - lgamma(p.d - x + 1) - x * Math.log(p.d))) },
  // 플랑크 법칙 B_λ = (2hc²/λ⁵)/(e^(hc/λkT) − 1). 가로축 λ(µm), 값은 W·sr⁻¹·m⁻²·µm⁻¹. SI 정의값 h, c, k
  planck: { params: { T: { gt: 0 } }, domain: [0, Infinity], desc: "플랑크 분광 복사 곡선",
    f: (x, p) => { if (x <= 0) return 0; const h = 6.62607015e-34, c = 299792458, k = 1.380649e-23, l = x * 1e-6; return (2 * h * c * c / l ** 5 / Math.expm1(h * c / (l * k * p.T))) * 1e-6; } },
  // 로그 곡선 a·ln x + b (브레게 항속거리, 칼슨 영양상태지수 등). x>0
  log: { params: { a: { gt: 0 }, b: {} }, domain: [1e-9, Infinity], desc: "로그 곡선",
    f: (x, p) => p.a * Math.log(x) + p.b },
  // 활성화 에너지 감소에 따른 속도 상수 비 exp(b/T), b=ΔEa/R(K). 가로축 온도 T(K)
  arrhenius_ratio: { params: { b: { gt: 0 } }, domain: [1e-9, Infinity], desc: "속도 상수 비 곡선",
    f: (x, p) => Math.exp(p.b / x) },
  // 1 − a^x (독립 검정 x개 중 적어도 하나가 유의할 확률 등, 0<a<1)
  complement_power: { params: { a: { gt: 0, lt: 1 } }, domain: [0, Infinity], desc: "누적 확률 곡선",
    f: (x, p) => 1 - p.a ** x },
  // 피드백 증폭 a/(1−x), 가로축 이득 x<1 (x→1에서 발산하므로 0.999까지)
  gain_amplification: { params: { a: { gt: 0 } }, domain: [-Infinity, 0.999], desc: "피드백 증폭 곡선",
    f: (x, p) => p.a / (1 - x) },
  // 푸아송 분포 P(n)=e^(−λ)λ^n/n!. 이산 분포라 x를 가장 가까운 정수로 반올림한 막대 높이(계단)
  poisson: { params: { lambda: { gt: 0 } }, domain: [0, Infinity], desc: "푸아송 분포",
    f: (x, p) => { const k = Math.round(x); return k < 0 ? 0 : Math.exp(-p.lambda + k * Math.log(p.lambda) - lgamma(k + 1)); } },
  // 보스–아인슈타인(열광) 분포 P(n)=n̄^n/(1+n̄)^(n+1). 반올림 계단
  bose_einstein: { params: { nbar: { gt: 0 } }, domain: [0, Infinity], desc: "보스–아인슈타인 분포",
    f: (x, p) => { const k = Math.round(x); return k < 0 ? 0 : Math.exp(k * Math.log(p.nbar) - (k + 1) * Math.log(1 + p.nbar)); } },
  // 삼각형(이선형) 응집법칙: δ0까지 σmax로 선형 상승, δf까지 선형 하강. δf>δ0 필요(아니면 NaN)
  cohesive_triangle: { params: { sigmaMax: { gt: 0 }, delta0: { gt: 0 }, deltaF: { gt: 0 } }, domain: [0, Infinity], desc: "삼각형 응집법칙 곡선",
    f: (x, p) => (p.deltaF <= p.delta0 ? NaN : x < 0 ? 0 : x <= p.delta0 ? p.sigmaMax * x / p.delta0 : x <= p.deltaF ? p.sigmaMax * (p.deltaF - x) / (p.deltaF - p.delta0) : 0) },
  // ── 추가 5개(P-WRITE-PLOT): f_dist·moving_avg_mag·iso834·square_partial·eps_ntu ──
  // F 분포 밀도(NIST 1.3.6.6.5). x=0: d1>2면 0, d1=2면 1, d1<2면 발산(Infinity)
  f_dist: { params: { d1: { gt: 0 }, d2: { gt: 0 } }, domain: [0, Infinity], desc: "F 분포",
    f: (x, p) => (x < 0 ? 0 : x === 0 ? (p.d1 > 2 ? 0 : p.d1 === 2 ? 1 : Infinity)
      : Math.exp(lgamma((p.d1 + p.d2) / 2) - lgamma(p.d1 / 2) - lgamma(p.d2 / 2) + (p.d1 / 2) * Math.log(p.d1 / p.d2) + (p.d1 / 2 - 1) * Math.log(x) - ((p.d1 + p.d2) / 2) * Math.log(1 + p.d1 * x / p.d2))) },
  // M점 이동평균 FIR의 진폭 응답 |sin(Mω/2)/(M sin(ω/2))|, 가로축 ω(rad, 0≤ω≤π). ω=0이면 1
  moving_avg_mag: { params: { M: { gt: 0 } }, domain: [0, Math.PI], desc: "이동평균 필터 진폭 응답",
    f: (x, p) => (x < 1e-9 ? 1 : Math.abs(Math.sin(p.M * x / 2) / (p.M * Math.sin(x / 2)))) },
  // ISO 834-1 표준 가열 곡선 T = 345·log10(8t+1) + 20 (t 분, T ℃)
  iso834: { params: {}, domain: [0, Infinity], desc: "표준 화재 곡선",
    f: (x) => 345 * Math.log10(8 * x + 1) + 20 },
  // 사각파(진폭 ±1)의 푸리에 부분합 (4/π)Σ_{k=1..n} sin((2k−1)x)/(2k−1). n은 반올림한 항 수
  square_partial: { params: { n: { gt: 0 } }, desc: "사각파 푸리에 부분합",
    f: (x, p) => { let s = 0; for (let k = 1; k <= Math.round(p.n); k++) s += Math.sin((2 * k - 1) * x) / (2 * k - 1); return 4 / Math.PI * s; } },
  // 열교환기 유효도 ε(NTU), Cr=Cmin/Cmax(0≤Cr<1). branch 0=대향류, 1=병류
  eps_ntu: { params: { Cr: { gte: 0, lt: 1 }, branch: { gte: 0, lt: 2 } }, domain: [0, Infinity], desc: "열교환기 유효도 곡선",
    f: (x, p) => (p.branch >= 1 ? (1 - Math.exp(-x * (1 + p.Cr))) / (1 + p.Cr)
      : (1 - Math.exp(-x * (1 - p.Cr))) / (1 - p.Cr * Math.exp(-x * (1 - p.Cr)))) },
};

function checkParams(fn, params) {
  const F = Object.prototype.hasOwnProperty.call(FNS, fn) ? FNS[fn] : null;
  if (!F) return [`알 수 없는 plot 함수: ${fn}`];
  const errs = [];
  const given = params && typeof params === "object" ? params : {};
  for (const [k, rule] of Object.entries(F.params)) {
    const v = given[k];
    if (rule.arr) { if (!Array.isArray(v) || !v.length || !v.every(Number.isFinite)) errs.push(`${fn}: 매개변수 ${k}는 숫자 배열`); continue; }
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
    let x = a + ((b - a) * i) / (n - 1);
    // 끝점이 특이점(카이제곱 df<2의 x=0)이면 칸 폭의 1/10만큼 안쪽에서 잰다.
    if ((i === 0 || i === n - 1) && !Number.isFinite(F.f(x, params))) x += ((i === 0 ? 1 : -1) * (b - a)) / (n - 1) / 10;
    pts.push([x, F.f(x, params)]);
  }
  return pts;
}

module.exports = { FNS, Phi, PhiInv, lgamma, checkParams, sample };
