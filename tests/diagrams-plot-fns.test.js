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

// 매개변수 검사
assert.deepStrictEqual(checkParams("normal", { mu: 0, sigma: 1 }), []);
assert.ok(checkParams("normal", { mu: 0 }).some((e) => e.includes("sigma")));
assert.ok(checkParams("normal", { mu: 0, sigma: -1 }).some((e) => e.includes("범위")));
assert.ok(checkParams("roc", { auc: 1 }).some((e) => e.includes("범위")));
assert.ok(checkParams("roc", { auc: 0.4 }).some((e) => e.includes("범위")));
assert.ok(checkParams("linear", { a: 1, b: 2, c: 3 }).some((e) => e.includes("알 수 없는")));
assert.ok(checkParams("logistic", { x0: 0, k: 0 }).some((e) => e.includes("범위")));

console.log("diagrams-plot-fns: all tests passed");
