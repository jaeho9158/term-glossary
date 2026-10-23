// plot 함수: 수치가 맞는지, 매개변수 검사가 잡는지
const assert = require("assert");
const { FNS, Phi, PhiInv, lgamma, checkParams, sample } = require("../scripts/diagrams/plot-fns.js");
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

// 기본 수학
near(Phi(0), 0.5);
near(Phi(1.96), 0.975, 1e-3);
near(PhiInv(0.975), 1.96, 1e-3);
near(PhiInv(Phi(-1.3)), -1.3, 1e-3);
near(lgamma(5), Math.log(24));
near(lgamma(0.5), Math.log(Math.sqrt(Math.PI)));

// 함수값
near(FNS.normal.f(0, { mu: 0, sigma: 1 }), 1 / Math.sqrt(2 * Math.PI));
near(FNS.t.f(0, { df: 1 }), 1 / Math.PI); // 코시 분포
near(FNS.chi2.f(2, { df: 2 }), 0.5 * Math.exp(-1));
near(FNS.exponential.f(0, { rate: 2 }), 2);
near(FNS.logistic.f(3, { x0: 3, k: 1 }), 0.5);
near(FNS.linear.f(2, { a: 3, b: 1 }), 7);
near(FNS.roc.f(0.3, { auc: 0.5 }), 0.3); // AUC 0.5는 대각선
assert.ok(FNS.roc.f(0.3, { auc: 0.9 }) > 0.3);
near(FNS.hill.f(10, { ec50: 10, n: 2 }), 0.5);
near(FNS.inverted_u.f(4, { peak: 4, width: 2 }), 1);
near(FNS.decay.f(0, { rate: 1 }), 1);

// 정규분포 최대점은 mu
{
  const pts = sample("normal", { mu: 1.5, sigma: 0.7 }, -2, 5);
  const top = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  near(top[0], 1.5, 0.06);
  assert.strictEqual(pts.length, 121);
}
// domain으로 잘린다
{
  const pts = sample("exponential", { rate: 1 }, -3, 4);
  assert.ok(pts[0][0] >= 0);
}

// 카이제곱 0 근처: df=2면 f(0)=0.5, df<2면 발산. 표본은 끝점 특이점을 살짝 피해 유한값만
near(FNS.chi2.f(0, { df: 2 }), 0.5);
assert.strictEqual(FNS.chi2.f(0, { df: 1 }), Infinity);
assert.strictEqual(FNS.chi2.f(-1, { df: 1 }), 0);
assert.strictEqual(FNS.chi2.f(0, { df: 4 }), 0);
{
  const pts = sample("chi2", { df: 1 }, 0, 10);
  assert.ok(pts.every(([, y]) => Number.isFinite(y)) && pts[0][0] > 0 && pts[0][0] < 0.05, String(pts[0]));
  near(sample("chi2", { df: 2 }, 0, 10)[0][1], 0.5);
}

// 매개변수 검사
assert.deepStrictEqual(checkParams("normal", { mu: 0, sigma: 1 }), []);
assert.ok(checkParams("normal", { mu: 0 }).some((e) => e.includes("sigma")));
assert.ok(checkParams("normal", { mu: 0, sigma: -1 }).some((e) => e.includes("범위")));
assert.ok(checkParams("roc", { auc: 1 }).some((e) => e.includes("범위")));
assert.ok(checkParams("roc", { auc: 0.4 }).some((e) => e.includes("범위")));
assert.ok(checkParams("linear", { a: 1, b: 2, c: 3 }).some((e) => e.includes("알 수 없는")));
assert.ok(checkParams("logistic", { x0: 0, k: 0 }).some((e) => e.includes("범위")));
// 프로토타입 속성 이름도 알 수 없는 매개변수
assert.ok(checkParams("linear", { a: 1, b: 2, toString: 3 }).some((e) => e.includes("알 수 없는")));
assert.ok(checkParams("normal", { mu: 0, sigma: 1, constructor: 1 }).some((e) => e.includes("알 수 없는")));

console.log("diagrams-plot-fns: all tests passed");

// km_function: K/S = (1−R)²/(2R) (쿠벨카-뭉크), mixing_free_energy: 플로리-허긴스 ΔG/kT
near(FNS.km_function.f(0.8, {}), 0.025);
near(FNS.km_function.f(0.1, {}), 4.05);
near(FNS.km_function.f(1, {}), 0);
assert.deepStrictEqual(checkParams("km_function", {}), []);
{
  const g = (x, chi) => FNS.mixing_free_energy.f(x, { N1: 100, N2: 1, chi });
  near(g(0.5, 0), 0.005 * Math.log(0.5) + 0.5 * Math.log(0.5));
  near(g(0.5, 1), g(0.5, 0) + 0.25);
  // 임계 χc=0.605, φc=1/11 에서 2차 도함수 0
  const c = 1 / 11, h = 1e-4;
  assert.ok(Math.abs((g(c + h, 0.605) - 2 * g(c, 0.605) + g(c - h, 0.605)) / (h * h)) < 1e-2);
  assert.ok(checkParams("mixing_free_energy", { N1: 0, N2: 1, chi: 1 }).length > 0);
  const pts = sample("mixing_free_energy", { N1: 100, N2: 1, chi: 1 }, 0, 1);
  assert.ok(pts.every(([, y]) => Number.isFinite(y)));
}

// 추가 6개: unbalance_response, laplace, sin_squared, cumulative_sin_squared, stretched_exp, damped_oscillation
near(FNS.unbalance_response.f(0.5, {}), 0.25 / 0.75);
near(FNS.unbalance_response.f(2, {}), 4 / 3);
near(FNS.unbalance_response.f(1, {}), 20); // 표시용 상한(분모 하한 0.05)
near(FNS.laplace.f(0, { mu: 0, b: 1 }), 0.5);
near(FNS.laplace.f(2, { mu: 0, b: 2 }), Math.exp(-1) / 4);
near(FNS.sin_squared.f(0.5, {}), 1);
near(FNS.sin_squared.f(0, {}), 0);
near(FNS.cumulative_sin_squared.f(0.3, {}), 0.3 - Math.sin(0.6 * Math.PI) / (2 * Math.PI));
near(FNS.cumulative_sin_squared.f(0.5, {}), 0.5);
near(FNS.cumulative_sin_squared.f(1, {}), 1);
near(FNS.stretched_exp.f(0, { k: 0.1, n: 1.5 }), 1);
near(FNS.stretched_exp.f(4, { k: 0.1, n: 2 }), Math.exp(-1.6));
near(FNS.damped_oscillation.f(0, { zeta: 0.3, wn: 1.2 }), 1);
// 한 감쇠 주기 뒤 진폭비 exp(−2πζ/√(1−ζ²)) (본문 표: ζ=0.05 → 73%, ζ=0.30 → 14%)
for (const [z, r] of [[0.05, 0.73], [0.3, 0.14]]) {
  const T = 2 * Math.PI / (1.2 * Math.sqrt(1 - z * z));
  assert.ok(Math.abs(FNS.damped_oscillation.f(T, { zeta: z, wn: 1.2 }) - r) < 0.005);
}
assert.ok(checkParams("damped_oscillation", { zeta: 1, wn: 1 }).length > 0);
assert.ok(checkParams("laplace", { mu: 0, b: 0 }).length > 0);
assert.deepStrictEqual(checkParams("sin_squared", {}), []);
console.log("diagrams-plot-fns: ext6 tests passed");

// 추가 12개(round4 plot-ext): 본문 수치로 대조
near(FNS.bet.f(0.1, { vm: 30, c: 100 }), 30.58, 0.005);
near(FNS.bet.f(0.2, { vm: 30, c: 100 }), 36.06, 0.005);
near(FNS.bet.f(0.3, { vm: 30, c: 100 }), 41.88, 0.005);
{
  let tail = 0;
  for (let k = 18; k <= 40; k++) tail += FNS.binomial_pmf.f(k, { n: 40, p: 0.3 });
  near(tail, 0.032, 0.0005); // 이항검정 본문 단측 p
  near(FNS.binomial_pmf.f(12.4, { n: 40, p: 0.3 }), FNS.binomial_pmf.f(12, { n: 40, p: 0.3 })); // 반올림 계단
  assert.strictEqual(FNS.binomial_pmf.f(41, { n: 40, p: 0.3 }), 0);
}
near(FNS.saturation_exp.f(5, { L0: 100, k: 0.23 }), 68.34, 0.01);
near(FNS.saturation_exp.f(20, { L0: 100, k: 0.23 }), 98.99, 0.01);
near(FNS.birthday_collision.f(23, { d: 365 }), 0.507297, 1e-6);
near(FNS.birthday_collision.f(0, { d: 365 }), 0);
near(FNS.birthday_collision.f(366, { d: 365 }), 1);
{
  const peak = (T) => { let b = 0, l = 0; for (let x = 0.1; x < 3; x += 0.0005) { const v = FNS.planck.f(x, { T }); if (v > b) { b = v; l = x; } } return l; };
  near(peak(3000), 0.966, 0.001); // 본문: 약 966 nm
  near(peak(5772), 0.502, 0.001); // 본문: 약 502 nm
}
near(FNS.log.f(1.25, { a: 27000, b: 0 }), 6025, 0.2);
near(FNS.log.f(1.3, { a: 27000, b: 0 }), 7084, 0.2);
near(FNS.log.f(1, { a: 9.81, b: 30.6 }), 30.6);
near(FNS.log.f(56, { a: 9.81, b: 30.6 }), 70.1, 0.02);
near(FNS.arrhenius_ratio.f(298, { b: 25000 / 8.314 }), 2.4e4, 200);
near(FNS.arrhenius_ratio.f(600, { b: 25000 / 8.314 }), 150, 1);
for (const [k, v] of [[1, 0.05], [3, 0.1426], [5, 0.2262], [10, 0.4013], [20, 0.6415]]) near(FNS.complement_power.f(k, { a: 0.95 }), v, 0.0001);
for (const [f, v] of [[0.3, 1.71], [0.5, 2.4], [0.7, 4], [0.9, 12]]) near(FNS.gain_amplification.f(f, { a: 1.2 }), v, 0.005);
for (const [n, v] of [[0, 0.0183], [1, 0.0733], [4, 0.1954], [8, 0.0298]]) near(FNS.poisson.f(n, { lambda: 4 }), v, 0.00005);
for (const [n, v] of [[0, 0.2], [3, 0.1024], [8, 0.0336]]) near(FNS.bose_einstein.f(n, { nbar: 4 }), v, 0.00005);
{
  const c = { sigmaMax: 50, delta0: 0.0005, deltaF: 0.02 };
  near(FNS.cohesive_triangle.f(0.0005, c), 50);
  near(FNS.cohesive_triangle.f(0.02, c), 0);
  near(FNS.cohesive_triangle.f(0.03, c), 0);
  // 곡선 아래 면적 = ½·σmax·δf = Gc = 0.5 N/mm
  let area = 0; const N = 40000;
  for (let i = 0; i < N; i++) area += FNS.cohesive_triangle.f((i + 0.5) * 0.02 / N, c) * 0.02 / N;
  near(area, 0.5, 1e-4);
  assert.ok(Number.isNaN(FNS.cohesive_triangle.f(0.01, { sigmaMax: 50, delta0: 0.02, deltaF: 0.01 })));
}
assert.ok(checkParams("complement_power", { a: 1 }).length > 0);
assert.ok(checkParams("binomial_pmf", { n: 40, p: 1 }).length > 0);
assert.deepStrictEqual(checkParams("planck", { T: 3000 }), []);
// round5 추가 13개: 본문 수치 대조
{
  const c = [-1000, 300, 400, 500, 300];
  [[0.06, 296.455], [0.08, 238.138], [0.1, 183.867], [0.12, 133.28], [0.15, 63.611]].forEach(([r, v]) => near(FNS.npv_curve.f(r, { cashflows: c }), v, 0.001));
  [[3, 30.0], [5, 16.4], [7, 11.0], [9, 8.4], [11, 6.4], [21, 2.4]].forEach(([n, v]) => near(FNS.staircase_thd.f(n), v, 0.06));
  [[10, 0.91], [20, 3.6], [30, 8.01], [40, 14.01]].forEach(([r, v]) => near(FNS.hyperbolic_phase.f(r, { lambda: 0.55, f: 100 }), v, 0.005));
  [[0.05, 5.13], [0.1, 10.52], [0.3, 34.99], [0.7, 101.38]].forEach(([b, v]) => near(FNS.expm1_scale.f(b, { scale: 100 }), v, 0.005));
  const L = { mu: 0, sigma: 0.5 };
  assert.ok(FNS.lognormal.f(Math.exp(-0.25), L) > FNS.lognormal.f(1, L) && FNS.lognormal.f(1, L) > FNS.lognormal.f(Math.exp(0.125), L));
  assert.strictEqual(FNS.lognormal.f(0, L), 0);
  const q = { gamma: 16, p: -0.25, beta: 5 };
  [[-1, 0.49], [-0.1, 0.79], [0, 1], [0.1, 1.5], [0.5, 3.5], [1, 6]].forEach(([z, v]) => near(FNS.piecewise_power.f(z, q), v, 0.005));
  near(FNS.reciprocal_shift.f(10, { a: 36, c: 37 }), 1 + 10 / 30);
  near(80 * FNS.reciprocal_shift.f(8, { a: 36, c: 37 }), 99.31, 0.01);
  assert.strictEqual(FNS.reciprocal_shift.f(37, { a: 36, c: 37 }), Infinity);
  near(FNS.doubling.f(10, { period: 1 }), 1024); near(FNS.doubling.f(10, { period: 2 }), 32); near(FNS.doubling.f(1, { period: 2 }), Math.SQRT2);
  const sp = { edges: [0, 4, 6, 8], values: [50, 200, 0] };
  near(FNS.step_profile.f(1, sp), 50); near(FNS.step_profile.f(5, sp), 200); near(FNS.step_profile.f(7, sp), 0);
  let twa = 0; for (let i = 0; i < 8000; i++) twa += FNS.step_profile.f((i + 0.5) / 1000, sp) / 1000; near(twa / 8, 75, 0.01);
  near(FNS.step_profile.f(23, { edges: [0, 22, 24], values: [15, 60] }), 60);
  near(FNS.lorentzian_resonance.f(1.005, { f0: 1, q: 100 }), 0.5); near(FNS.lorentzian_resonance.f(1, { f0: 1, q: 100 }), 1);
  near(FNS.erp_peak.f(340, { amp: 8.2, latency: 340, width: 90 }), 8.2);
  near(FNS.lm_kinked.f(2, { i0: 1, x0: 3, slope: 0.8 }), 1); near(FNS.lm_kinked.f(5, { i0: 1, x0: 3, slope: 0.8 }), 2.6);
  near(FNS.offer_curve.f(4, { a: 2, b: 0.5, branch: 0 }), 4); near(FNS.offer_curve.f(4, { a: 2, b: 0.5, branch: 1 }), 4);
  assert.ok(checkParams("offer_curve", { a: 2, b: 1, branch: 0 }).length > 0);
  assert.ok(checkParams("step_profile", { edges: [0, 1], values: [] }).length > 0);
  assert.deepStrictEqual(checkParams("staircase_thd", {}), []);
}
console.log("diagrams-plot-fns: ext12 tests passed");

// ext5: f_dist·moving_avg_mag·iso834·square_partial·eps_ntu
{
  const upper = (d1, d2, c) => { let a = 0; const N = 400000, H = 1500; for (let i = 0; i < N; i++) a += FNS.f_dist.f(c + (i + 0.5) * (H - c) / N, { d1, d2 }) * (H - c) / N; return a; };
  near(upper(2, 27, 3.354), 0.05, 5e-4);
  near(upper(1, 27, 4.21), 0.05, 5e-4);
  near(upper(2, 15, 3.68), 0.05, 5e-4);
  near(upper(2, 15, 7.36), 0.006, 5e-4);
  near(FNS.f_dist.f(0, { d1: 2, d2: 27 }), 1);
  for (const [w, v] of [[0, 1], [Math.PI / 3, 0.667], [2 * Math.PI / 3, 0], [Math.PI, 0.333]]) near(FNS.moving_avg_mag.f(w, { M: 3 }), v, 5e-4);
  for (const [t, v] of [[5, 576], [15, 739], [30, 842], [60, 945], [90, 1006], [120, 1049]]) near(FNS.iso834.f(t, {}), v, 0.6);
  for (const [n, v] of [[5, 1.182], [25, 1.179], [100, 1.179]]) {
    let mx = 0; for (let i = 1; i < 100000; i++) mx = Math.max(mx, FNS.square_partial.f(Math.PI * i / 100000, { n }));
    near(mx, v, 0.001);
  }
  for (const [N, c, p] of [[0.5, 0.362, 0.352], [1, 0.565, 0.518], [2, 0.775, 0.633], [3, 0.874, 0.659]]) {
    near(FNS.eps_ntu.f(N, { Cr: 0.5, branch: 0 }), c, 5e-4);
    near(FNS.eps_ntu.f(N, { Cr: 0.5, branch: 1 }), p, 5e-4);
  }
  assert.ok(checkParams("eps_ntu", { Cr: 1, branch: 0 }).length > 0);
  assert.deepStrictEqual(checkParams("f_dist", { d1: 2, d2: 27 }), []);
}
console.log("diagrams-plot-fns: ext5 tests passed");
