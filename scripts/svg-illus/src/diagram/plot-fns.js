// 원본: term-style/scripts/diagrams/plot-fns.js (ESM으로 옮기고 색 변수를 --si-* 공통 토큰으로 바꿈)
// plot 도식용 함수 10개. 스펙은 함수 이름과 매개변수만 쓰고, 점은 여기서 계산한다
// (LLM이 좌표를 찍으면 틀린 그래프가 그대로 거짓 정보가 되므로).

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
  // ── 추가 함수 7개(plot-ext.json 제안) ──
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
  // ── 추가(round5 plot-ext·needs-fn, 본문 수치로 검증): lognormal·piecewise_power·offer_curve·lm_kinked·expm1_scale·hyperbolic_phase·lorentzian_resonance·doubling·staircase_thd·npv_curve·step_profile·reciprocal_shift·erp_peak ──
  // 로그정규분포 밀도 1/(xσ√2π)·exp(−(ln x−μ)²/2σ²). x>0
  lognormal: { params: { mu: {}, sigma: { gt: 0 } }, domain: [0, Infinity], desc: "로그정규분포",
    f: (x, p) => (x <= 0 ? 0 : Math.exp(-0.5 * ((Math.log(x) - p.mu) / p.sigma) ** 2) / (x * p.sigma * Math.sqrt(2 * Math.PI))) },
  // 모닌-오부코프형 상사함수: x<0이면 (1−γx)^p, x≥0이면 1+βx (Businger–Dyer형, p=−1/4)
  piecewise_power: { params: { gamma: { gt: 0 }, p: {}, beta: { gt: 0 } }, desc: "구간별 상사함수",
    f: (x, q) => (x < 0 ? (1 - q.gamma * x) ** q.p : 1 + q.beta * x) },
  // 오퍼곡선. branch 0: y=a·x^b(수출재 가로축), branch 1: 상대국 곡선 x=a·y^b를 같은 축에 그린 y=(x/a)^(1/b). 0<b<1
  offer_curve: { params: { a: { gt: 0 }, b: { gt: 0, lt: 1 }, branch: { gte: 0, lt: 2 } }, domain: [0, Infinity], desc: "오퍼곡선",
    f: (x, p) => (x <= 0 ? 0 : p.branch >= 1 ? (x / p.a) ** (1 / p.b) : p.a * x ** p.b) },
  // LM 곡선(유동성 함정): x≤x0에서 수평 i0, 이후 기울기 slope로 상승
  lm_kinked: { params: { i0: {}, x0: {}, slope: { gt: 0 } }, desc: "꺾인 LM 곡선",
    f: (x, p) => (x <= p.x0 ? p.i0 : p.i0 + p.slope * (x - p.x0)) },
  // scale·(e^x − 1): 로그-선형 회귀 계수 b의 정확한 변화율(%)은 scale=100
  expm1_scale: { params: { scale: { gt: 0 } }, desc: "정확한 변화율 곡선",
    f: (x, p) => p.scale * Math.expm1(x) },
  // 메타렌즈 쌍곡선 위상 (√(r²+f²)−f)/λ (주기 단위). 가로축 반지름 r≥0
  hyperbolic_phase: { params: { lambda: { gt: 0 }, f: { gt: 0 } }, domain: [0, Infinity], desc: "렌즈 위상 곡선",
    f: (x, p) => (Math.sqrt(x * x + p.f * p.f) - p.f) / p.lambda },
  // 공진기 전력 응답 1/(1+4Q²((x−f0)/f0)²). 반치폭 f0/Q
  lorentzian_resonance: { params: { f0: { gt: 0 }, q: { gt: 0 } }, desc: "공진 응답 곡선",
    f: (x, p) => 1 / (1 + 4 * p.q * p.q * ((x - p.f0) / p.f0) ** 2) },
  // 2^(x/period): 배가 주기 period마다 두 배
  doubling: { params: { period: { gt: 0 } }, domain: [0, Infinity], desc: "배가 성장 곡선",
    f: (x, p) => 2 ** (x / p.period) },
  // 반올림 계단파 round(M sin t)/M, M=(N−1)/2 의 49차까지 THD(%). 가로축 레벨 수 N≥3. 푸리에 계수는 계단 경계로 정확히 계산
  staircase_thd: { params: {}, domain: [3, Infinity], desc: "계단파 THD 곡선",
    f: (x) => {
      // 홀수 N에서만 정의되는 값이라, 그 사이는 이웃한 홀수 N 값을 직선으로 잇는다
      const at = (N) => {
        const M = (N - 1) / 2, ts = [];
        for (let k = 0; k + 0.5 <= M; k++) ts.push(Math.asin((k + 0.5) / M));
        const b = (h) => ts.reduce((s, t) => s + Math.cos(h * t), 0) / h;
        let s2 = 0;
        for (let h = 3; h <= 49; h += 2) s2 += b(h) ** 2;
        return (100 * Math.sqrt(s2)) / b(1);
      };
      if (!(x >= 3)) return NaN;
      const lo = 2 * Math.floor((x - 1) / 2) + 1;
      return lo === x ? at(lo) : at(lo) + ((x - lo) / 2) * (at(lo + 2) - at(lo));
    } },
  // 순현재가치 NPV(r)=Σ CF_t/(1+r)^t. 가로축 할인율 r (소수, r>−1)
  npv_curve: { params: { cashflows: { arr: true } }, domain: [0, Infinity], desc: "순현재가치 곡선",
    f: (x, p) => p.cashflows.reduce((s, cf, t) => s + cf / (1 + x) ** t, 0) },
  // 구간별 상수: edges 길이 = values 길이 + 1, edges[i] ≤ x < edges[i+1]이면 values[i] (범위 밖은 0)
  step_profile: { params: { edges: { arr: true }, values: { arr: true } }, desc: "구간별 상수 농도(계단)",
    f: (x, p) => { if (p.edges.length !== p.values.length + 1) return NaN; for (let i = 0; i < p.values.length; i++) if (x >= p.edges[i] && x < p.edges[i + 1]) return p.values[i]; return 0; } },
  // a/(c−x) (Brzycki 1RM/w = 36/(37−n)). x≥c이면 발산
  reciprocal_shift: { params: { a: { gt: 0 }, c: {} }, desc: "이동한 반비례 곡선",
    f: (x, p) => (x >= p.c ? Infinity : p.a / (p.c - x)) },
  // 사건관련전위 봉우리 amp·exp(−((t−latency)/width)²). 폭은 모식값
  erp_peak: { params: { amp: {}, latency: {}, width: { gt: 0 } }, desc: "사건관련전위 파형",
    f: (x, p) => p.amp * Math.exp(-(((x - p.latency) / p.width) ** 2)) },
  // ── 추가 7개(round6 plot-ext, 본문 수치로 검증): quadratic·saturating_exponential·saturating_hyperbola·one_minus_reciprocal·harmonic_mix·cumulative_step·piecewise_linear ──
  // 2차 곡선 a + b·x² (로스비파 위상속도 c = U − β(L/2π)² 등, 매개변수는 가로축 단위에 맞춰 환산)
  quadratic: { params: { a: {}, b: {} }, desc: "2차 곡선",
    f: (x, p) => p.a + p.b * x * x },
  // 오프셋이 있는 포화 지수 곡선 a + b(1 − e^(−x/c)) (R-곡선 등, x≥0)
  saturating_exponential: { params: { a: {}, b: { gt: 0 }, c: { gt: 0 } }, domain: [0, Infinity], desc: "포화 지수 곡선",
    f: (x, p) => p.a + p.b * (1 - Math.exp(-x / p.c)) },
  // 포화 쌍곡선 a·x/(1+x) (CSTR 전환율 kτ/(1+kτ) 등, x≥0)
  saturating_hyperbola: { params: { a: { gt: 0 } }, domain: [0, Infinity], desc: "포화 쌍곡선",
    f: (x, p) => (p.a * x) / (1 + x) },
  // a(1 − 1/x) (털록 경쟁의 전체 지출 100(n−1)/n 등, x≥1)
  one_minus_reciprocal: { params: { a: { gt: 0 } }, domain: [1, Infinity], desc: "1에서 반비례를 뺀 곡선",
    f: (x, p) => p.a * (1 - 1 / x) },
  // 조화평균 혼합(Reuss 하한) 1/(x/a + (1−x)/b), 가로축 x=Vf (0≤x≤1)
  harmonic_mix: { params: { a: { gt: 0 }, b: { gt: 0 } }, domain: [0, 1], desc: "조화평균 혼합 곡선",
    f: (x, p) => 1 / (x / p.a + (1 - x) / p.b) },
  // 누적 계단: 구간 k ≤ x < k+1 에서 values의 처음 k개 합(x<1이면 0, 마지막 값 이후는 전체 합)
  cumulative_step: { params: { values: { arr: true } }, domain: [0, Infinity], desc: "누적 계단 곡선",
    f: (x, p) => { let s = 0; const k = Math.min(Math.floor(x), p.values.length); for (let i = 0; i < k; i++) s += p.values[i]; return s; } },
  // 꺾은선: 점 (xs[i], ys[i])를 직선으로 잇는다. xs는 증가해야 하고 범위 밖은 끝 값을 유지
  piecewise_linear: { params: { xs: { arr: true }, ys: { arr: true } }, desc: "꺾은선",
    f: (x, p) => { const n = p.xs.length; if (x <= p.xs[0]) return p.ys[0]; if (x >= p.xs[n - 1]) return p.ys[n - 1]; let i = 1; while (p.xs[i] < x) i++; return p.ys[i - 1] + ((p.ys[i] - p.ys[i - 1]) * (x - p.xs[i - 1])) / (p.xs[i] - p.xs[i - 1]); } },
  // ── round7 plot-ext 4개: gaussian_sum·debye·piecewise_linear·haldane ──
  // 가우스 봉우리 합 Σ a_i·exp(−(x−μ_i)²/(2σ_i²)). a·mu·sigma는 같은 길이의 배열(sigma>0)
  gaussian_sum: { params: { a: { arr: true }, mu: { arr: true }, sigma: { arr: true } }, desc: "가우스 봉우리 합 곡선",
    f: (x, p) => { let s = 0; for (let i = 0; i < p.a.length; i++) { const sg = p.sigma[i]; if (!(sg > 0)) return NaN; s += p.a[i] * Math.exp(-((x - p.mu[i]) ** 2) / (2 * sg * sg)); } return s; } },
  // 디바이 비열 C/3R = 3x³∫₀^{1/x} t⁴eᵗ/(eᵗ−1)² dt, x=T/θD (심프슨 적분, 저온 극한 (4π⁴/5)x³)
  debye: { params: {}, domain: [0, Infinity], desc: "디바이 비열 곡선",
    f: (x) => { if (x <= 0) return 0; if (x < 0.02) return (4 * Math.PI ** 4 / 5) * x ** 3; const U = 1 / x, N = 400, h = U / N; const g = (t) => (t < 1e-9 ? 0 : (t ** 4 * Math.exp(t)) / (Math.expm1(t) ** 2)); let s = g(0) + g(U); for (let i = 1; i < N; i++) s += g(i * h) * (i % 2 ? 4 : 2); return 3 * x ** 3 * s * h / 3; } },
  // 구간 선형 Σ max(s_i(x−k_i),0)+c. k·s는 같은 길이의 배열(옵션 만기손익 등)
  piecewise_slope: { params: { k: { arr: true }, s: { arr: true }, c: {} }, desc: "구간 선형(꺾은선) 곡선",
    f: (x, p) => { let y = p.c; for (let i = 0; i < p.k.length; i++) y += Math.max(p.s[i] * (x - p.k[i]), 0); return y; } },
  // Haldane(Andrews) 기질저해 μ = μmax·S/(Ks+S+S²/Ki). Ki를 매우 크게 두면 Monod
  haldane: { params: { mumax: { gt: 0 }, Ks: { gt: 0 }, Ki: { gt: 0 } }, domain: [0, Infinity], desc: "기질저해 성장 곡선",
    f: (x, p) => (x <= 0 ? 0 : p.mumax * x / (p.Ks + x + x * x / p.Ki)) },
  // ── 추가 함수(round8): antoine_p·antoine_t·raoult_dew·vdw·growth_mai·growth_cai·nh3_fraction·lorenz·sine_wave ──
  // 안토인 식: log10 P = A − B/(C + T). antoine_p는 T→P, antoine_t는 P→T(역함수)
  antoine_p: { params: { A: {}, B: { gt: 0 }, C: {} }, desc: "안토인 증기압 곡선",
    f: (x, p) => (p.C + x <= 0 ? NaN : Math.pow(10, p.A - p.B / (p.C + x))) },
  antoine_t: { params: { A: {}, B: { gt: 0 }, C: {} }, domain: [1e-6, Infinity], desc: "안토인 끓는점 곡선",
    f: (x, p) => (x <= 0 || p.A - Math.log10(x) <= 0 ? NaN : p.B / (p.A - Math.log10(x)) - p.C) },
  // 라울 법칙 이성분계의 이슬점 곡선: 가로축 y1(기상 조성), P = 1/(y1/P1sat + (1−y1)/P2sat)
  raoult_dew: { params: { p1: { gt: 0 }, p2: { gt: 0 } }, domain: [0, 1], desc: "이슬점 곡선(라울 법칙)",
    f: (x, p) => 1 / (x / p.p1 + (1 - x) / p.p2) },
  // 반데르발스 등온선 P = RT/(V−b) − a/V² (R=0.083145 L·bar/(mol·K), V L/mol, P bar). V≤b면 NaN
  vdw: { params: { T: { gt: 0 }, a: { gt: 0 }, b: { gt: 0 } }, domain: [0, Infinity], desc: "반데르발스 등온선",
    f: (x, p) => (x <= p.b ? NaN : 0.083145 * p.T / (x - p.b) - p.a / (x * x)) },
  // 임목 재적 V(t)=A(1−e^{−kt})^m의 평균생장량 V/t와 연년생장량 dV/dt
  growth_mai: { params: { A: { gt: 0 }, k: { gt: 0 }, m: { gt: 0 } }, domain: [0, Infinity], desc: "평균생장량 곡선",
    f: (x, p) => (x <= 0 ? 0 : p.A * Math.pow(1 - Math.exp(-p.k * x), p.m) / x) },
  growth_cai: { params: { A: { gt: 0 }, k: { gt: 0 }, m: { gt: 0 } }, domain: [0, Infinity], desc: "연년생장량 곡선",
    f: (x, p) => (x < 0 ? 0 : p.A * p.m * p.k * Math.exp(-p.k * x) * Math.pow(1 - Math.exp(-p.k * x), p.m - 1)) },
  // 비이온화 암모니아(NH3) 비율(%)의 pH 의존성(민물): pKa = 0.09018 + 2729.92/T(K), T는 ℃로 받는다
  nh3_fraction: { params: { T: { gt: -273 } }, desc: "비이온화 암모니아 비율 곡선",
    f: (x, p) => 100 / (1 + Math.pow(10, 0.09018 + 2729.92 / (p.T + 273.15) - x)) },
  // 로렌츠 곡선: shares는 오름차순 개인(가구)별 몫(합은 임의). 0≤x≤1에서 누적 점유율의 꺾은선
  lorenz: { params: { shares: { arr: true } }, domain: [0, 1], desc: "로렌츠 곡선",
    f: (x, p) => { const n = p.shares.length, tot = p.shares.reduce((a, b) => a + b, 0); const t = Math.min(Math.max(x, 0), 1) * n; const i = Math.min(Math.floor(t), n - 1); let c = 0; for (let k = 0; k < i; k++) c += p.shares[k]; return (c + p.shares[i] * (t - i)) / tot; } },
  // 사인파 sin(2π·f·x)
  sine_wave: { params: { f: { gt: 0 } }, domain: [0, Infinity], desc: "사인파",
    f: (x, p) => Math.sin(2 * Math.PI * p.f * x) },
  // ── 추가 7개(round9 plot-ext, 본문 수치로 검증): taylor_poly·triprotic_fractions·power_offset·bond_price_yield·geometric_pmf·threshold_series·discrete_series ──
  // 테일러 다항식. kind 0: e^x의 n차 매클로린 다항식, 1: ln(1+x)의 n항 부분합, 2: 실제 e^x, 3: 실제 ln(1+x)(x>−1). 2·3에서 n은 쓰지 않는다(0으로 둔다)
  taylor_poly: { params: { n: { gte: 0 }, kind: { gte: 0, lt: 4 } }, desc: "테일러 다항식 근사",
    f: (x, p) => { const n = Math.round(p.n), kd = Math.floor(p.kind); if (kd === 2) return Math.exp(x); if (kd === 3) return x > -1 ? Math.log1p(x) : NaN; let s = 0; if (kd === 0) { let t = 1; for (let k = 0; k <= n; k++) { s += t; t *= x / (k + 1); } } else for (let k = 1; k <= n; k++) s += (k % 2 ? 1 : -1) * x ** k / k; return s; } },
  // 삼양성자산의 pH별 화학종 분율(%). 가로축 pH, species 0=H3A 1=H2A− 2=HA2− 3=A3−, pKa1·pKa2·pKa3는 단계별 pKa
  triprotic_fractions: { params: { pKa1: {}, pKa2: {}, pKa3: {}, species: { gte: 0, lt: 4 } }, desc: "삼양성자산 화학종 분율 곡선",
    f: (x, p) => { const h = 10 ** -x, k1 = 10 ** -p.pKa1, k2 = 10 ** -p.pKa2, k3 = 10 ** -p.pKa3; const t = [h * h * h, k1 * h * h, k1 * k2 * h, k1 * k2 * k3]; return (100 * t[Math.floor(p.species)]) / (t[0] + t[1] + t[2] + t[3]); } },
  // 거듭제곱에서 상수를 뺀 곡선 a·x^b − c. Heskestad 화염높이 L = 0.235·Q^(2/5) − 1.02·D 에서 D를 고정하면 c = 1.02·D
  power_offset: { params: { a: { gt: 0 }, b: { gt: 0 }, c: {} }, domain: [0, Infinity], desc: "거듭제곱 빼기 상수 곡선",
    f: (x, p) => p.a * Math.max(x, 0) ** p.b - p.c },
  // 채권 가격-수익률 곡선(연 1회 이표, 액면 100). 가로축 수익률 y(%), c 쿠폰율(%), n 만기(년), nc 콜 시점(년), K 콜가격. branch 0=일반채권(만기까지), 1=수의상환채(만기가격과 콜가격 기준 가격 중 낮은 값)
  bond_price_yield: { params: { c: { gte: 0 }, n: { gt: 0 }, nc: { gt: 0 }, K: { gt: 0 }, branch: { gte: 0, lt: 2 } }, domain: [0, Infinity], desc: "채권 가격-수익률 곡선",
    f: (x, p) => { const r = 1 + x / 100, pv = (N, F) => { let s = F / r ** N; for (let t = 1; t <= N; t++) s += p.c / r ** t; return s; }; const m = pv(Math.round(p.n), 100); return p.branch >= 1 ? Math.min(m, pv(Math.round(p.nc), p.K)) : m; } },
  // 기하분포 확률 P(X=k)=(1−p)^(k−1)·p, k=1,2,… 이산 분포라 x를 가장 가까운 정수로 반올림한 막대 높이(계단). k<1이면 0
  geometric_pmf: { params: { p: { gt: 0, lt: 1 } }, domain: [0, Infinity], desc: "기하분포 확률",
    f: (x, q) => { const k = Math.round(x); return k < 1 ? 0 : (1 - q.p) ** (k - 1) * q.p; } },
  // 일 단위 값 계열(해양열파의 평년 대비 편차 등): x를 가장 가까운 정수 일(1일째=values[0])로 반올림한 계단. 범위 밖은 0
  threshold_series: { params: { values: { arr: true } }, domain: [0, Infinity], desc: "일별 값 계열(계단)",
    f: (x, p) => { const d = Math.round(x); return d >= 1 && d <= p.values.length ? p.values[d - 1] : 0; } },
  // 정수 위치의 이산 값 계열(차수별 점수 등): x를 가장 가까운 정수로 반올림해 ys[0]이 x=0. 범위 밖은 끝 값을 유지하는 계단
  discrete_series: { params: { ys: { arr: true } }, domain: [0, Infinity], desc: "정수 위치별 값 계열(계단)",
    f: (x, p) => p.ys[Math.min(Math.max(Math.round(x), 0), p.ys.length - 1)] },
  // ── round9 추가 4개: norrish_aw·shockley_diode·te_efficiency·double_well ──
  // 노리시(Norrish, 1966) 수분활성도 Aw = x_w·exp(−K·x_s²). 가로축 용질 중량%(0~100), M 용질 몰질량(g/mol), K 용질 상수(자당 6.47). 물 몰질량 18.015
  norrish_aw: { params: { K: { gte: 0 }, M: { gt: 0 } }, domain: [0, 100], desc: "노리시 수분활성도 곡선",
    f: (x, p) => { if (x < 0 || x >= 100) return NaN; const ns = x / p.M, nw = (100 - x) / 18.015, xs = ns / (ns + nw); return (1 - xs) * Math.exp(-p.K * xs * xs); } },
  // 쇼클리 다이오드 식 I = Is·[exp(V/(n·VT)) − 1]. 가로축 전압 V(볼트), VT 열전압(V), Is는 세로축 단위 그대로
  shockley_diode: { params: { Is: { gt: 0 }, n: { gt: 0 }, VT: { gt: 0 } }, desc: "쇼클리 다이오드 전류-전압 곡선",
    f: (x, p) => p.Is * Math.expm1(x / (p.n * p.VT)) },
  // 열전 소자 최대 효율(%) η = [(Th−Tc)/Th]·[√(1+ZT)−1]/[√(1+ZT)+Tc/Th]. 가로축 평균 ZT(≥0)
  te_efficiency: { params: { Th: { gt: 0 }, Tc: { gt: 0 } }, domain: [0, Infinity], desc: "열전 변환 효율 곡선",
    f: (x, p) => { const s = Math.sqrt(1 + Math.max(x, 0)); return (100 * (p.Th - p.Tc) / p.Th) * (s - 1) / (s + p.Tc / p.Th); } },
  // 이중 우물(두 골짜기) 곡선 x⁴ − b·x² + a·x. a≠0이면 두 극소의 높이가 달라 국소 최소와 전역 최소가 생긴다
  double_well: { params: { a: {}, b: { gt: 0 } }, desc: "이중 우물 곡선",
    f: (x, p) => x ** 4 - p.b * x * x + p.a * x },

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
  if (fn === "piecewise_linear" && Array.isArray(given.xs) && Array.isArray(given.ys)) {
    if (given.xs.length !== given.ys.length || given.xs.length < 2) errs.push("piecewise_linear: xs와 ys는 같은 길이(2 이상)");
    else if (given.xs.some((v, i) => i > 0 && !(v > given.xs[i - 1]))) errs.push("piecewise_linear: xs는 증가해야 함");
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

export { FNS, Phi, PhiInv, lgamma, checkParams, sample };
