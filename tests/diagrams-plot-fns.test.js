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
