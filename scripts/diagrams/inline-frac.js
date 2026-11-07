'use strict';
// 그림 스펙 문자열에서 인라인 수학 분수(a/b, Ea/RT, (n-1)/2 ...)를 찾아 {frac:분자,분모}로 바꾼다.
// 단위(m/s, mg/dL), 이름 쌍(G1/S, W/O, APC/C), 날짜·URL·점수는 건드리지 않는다.
// 검사: findInlineFractions(문자열) -> [{before, after}] (비어 있어야 정상). 변환: convertString.

const ATOM = /[A-Za-zĀ-ſℏΑ-Ωα-ωϕφ0-9₀-₉⁰-⁹²³ᵗⁿₐₑₓ.·′'_^!√∂Δ∆ℓ°%]/;
const HAN = /[가-힣]/;

function groupBack(s, i) {
  let d = 0;
  for (let k = i; k >= 0; k--) {
    const c = s[k];
    if (')]}'.includes(c)) d++;
    else if ('([{'.includes(c)) { d--; if (d === 0) return k; }
  }
  return -1;
}
function groupFwd(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { d--; if (d === 0) return k; }
  }
  return -1;
}
function scanLeft(s, end) {
  let i = end;
  while (i > 0) {
    const c = s[i - 1];
    if (')]}'.includes(c)) {
      const g = groupBack(s, i - 1);
      if (g < 0) break;
      i = g;
      continue;
    }
    if (ATOM.test(c)) { i--; continue; }
    break;
  }
  return i;
}
function scanRight(s, start) {
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if ('([{'.includes(c)) {
      const g = groupFwd(s, i);
      if (g < 0) break;
      // 분모 뒤에 붙은 설명 괄호((G는 ...), (예))는 식이 아니다
      if (i > start && s[i - 1] !== '√' && HAN.test(s.slice(i, g))) break;
      i = g + 1;
      continue;
    }
    if (ATOM.test(c)) { i++; continue; }
    break;
  }
  return i;
}

// 단위 기호. 분수가 아니라 단위 표기(m/s, mg/dL, kJ/mol)는 인라인 그대로 둔다.
const UNIT_SYM = /^(kg|g|mg|µg|μg|ug|ng|pg|L|mL|dL|µL|μL|ml|dl|l|min|s|sec|h|hr|d|day|yr|year|m|km|cm|mm|dm|nm|µm|μm|mol|mmol|µmol|μmol|kJ|J|W|Hz|MHz|kHz|ha|kcal|cal|kPa|Pa|MPa|N|V|A|C|K|T|F|°C|°|cell|cells|lb|lbf|ton|kWh|MJ|mV|μV|mW|dB|eV|keV|mmHg|decade|dec|capita|meq|mEq|eq|rev|rad|bar|Mpc|IU|U|Da|kDa|bp|nt|rpm|ppm|ppb|mA|kV|kW|Gb|GtC|CFU|BOD|CO₂e|Eq|Gy|dS|mGal|μC|µC|μU|mIU|mOsm|mJ|mN|mS|pm|kN|ms|t|STP|bw|atm|dm|ΔpH|cmol)$/;
function unitParts(x) {
  return x
    .replace(/_{[^}]*}/g, '')
    .replace(/[(){}\[\]]/g, ' ')
    .split(/[·*\/\s]+/)
    .map((p) => p.replace(/[⁻⁺⁰-⁹²³^_{}\-−+\d.]+$/, '').replace(/^[\d.%]+/, ''))
    .filter(Boolean);
}
const isUnitExpr = (x) => { const p = unitParts(x); return p.length > 0 && p.every((u) => UNIT_SYM.test(u)); };
const numeric = (x) => /^[\d.,]+[%°]?$/.test(x);
const stripParens = (x) => (x[0] === '(' && groupFwd(x, 0) === x.length - 1 ? x.slice(1, -1) : x);

// 단위로 보지 않을 분수(수학 변수 쌍)가 단위 기호와 겹칠 때의 보호: 분자가 단위 이름이어야만 단위로 본다
function isUnitFraction(num, den0) {
  const den = stripParens(den0);
  const dn = den.replace(/[⁻⁺⁰-⁹²³^_{}\-−+\d.]+$/, '');
  if (num === 'U' && den === 'L') return true;
  if (num === '%') return isUnitExpr(den);
  if (/^10\^\{?\d+\}?$/.test(num) && den === 'L') return true;
  if (num === 't' && /^(ha|m³|l)$/.test(den)) return true;
  if (numeric(num)) {
    // 숫자/단위: 10^9/L, 0.028/°C, 1/s. 단일 대문자 분모(1/T, 1/E)는 변수일 수 있어 제외
    if (/^[A-Z]$/.test(den)) return (den === 'K' && /[%°]$/.test(num)) || den === 'L' && /^10\^/.test(num);
    return isUnitExpr(den);
  }
  if (isUnitExpr(num) && /^(100|1000|1\.73|100000)$/.test(den)) return /^(g|mg|kg|mL|dL|mol|min|L|μg|µg|ng)$/.test(num);
  if (!isUnitExpr(num) || !isUnitExpr(den)) {
    // 단위 뒤에 숫자가 붙은 꼴: m/s·19.6
    if (isUnitExpr(num) && !/^[A-Z]$/.test(num) && /^[a-z°μµ]+·[\d.]+$/.test(den) && UNIT_SYM.test(den.replace(/·[\d.]+$/, ''))) return true;
    return false;
  }
  // 둘 다 단위 기호: 단일 대문자 분자는 J N W V L U K C만 단위 후보, 분모는 소문자·여러 글자·K일 때만
  if (/^[A-Z]$/.test(num)) return (/^[JNWVLUKC]$/.test(num) && den === 'K') || (den.length > 1 && !/^[A-Z]$/.test(den)) || /^[a-z]$/.test(den);
  if (/^[a-z]$/.test(num)) return /^[gmlst]$/.test(num); // 한 글자 소문자는 g m l s t만 단위 후보
  return true;
}

const NAMEPAIR = /^(m\/z|W\/O|O\/W|D\/H|I\/O|B\/L|B\/M|S\/I|P\/O|E\/I|O\/I|M\/M|R\/S|E\/Z|H\/D|S\/Z|G1\/S|G2\/M|S\/G2|A1\/A2|fl\/fl|Cre\/\+|On\/Off|O\/D|A\/C|B\/A)$/;
const NAME_PAIRS = new Set('A/a B/b D/L D/A D/P C/A C/N C/L V/V v/v w/v M/1 M/pH A/S o/p I/E S/N Gq/11 G12/13 Gi/o Ku70/80 CD80/86 IV6/4 TD5/5 TD50/5 ED50/LD50 E6/E7 Cas9/gRNA Hsp100/Clp Gs/Gi AB/BA'.split(' '));
const NAMERE = { test: (p) => NAME_PAIRS.has(p) || /\/CaM$/.test(p) };
const ELEM = new Set('Cu Ni Mg Ca Na Si Li Co Al Fe Zn Mn Cl Br Ga As Ti Cr Ag Au Pb Sn'.split(' '));
const elem = (x) => ELEM.has(x.replace(/[_^]?\{?[\d+\-−]*\}?[+\-−]?$/, '').replace(/[₂₃]|\d+$/, ''));
const WORDLIKE = /^[A-Z]?[a-z]{4,}$/; // Head, Browser, Symptoms, gross
const MATHWORD = /^(Vmax|Vmin|Cmax|Cmin|kcat|Imax|Pmax|Tmax|Vin|Vout|Rmax)$/;

function insideExp(s, j) {
  let d = 0;
  for (let k = j - 1; k >= 0; k--) {
    const c = s[k];
    if (')]}'.includes(c)) d++;
    else if ('([{'.includes(c)) {
      if (d === 0) return s[k - 1] === '^' || s[k - 1] === '_';
      d--;
    }
  }
  return false;
}
const ctx = (s, j) => s.slice(Math.max(0, j - 14), j + 14);

function looksLikeUrl(s) {
  return /https?:|www\.|\.(com|org|edu|gov|net|html?|pdf|jpg|png|svg|php)\b|\.(uk|at|ac|kr)\//.test(s) || /\/wiki\b|\/phd\b|\/Bookshelves/.test(s);
}

function convertString(s) {
  const changes = [];
  const left = [];
  if (!s.includes('/') || looksLikeUrl(s)) return { out: s, changes, left };
  const reps = [];
  for (let j = 0; j < s.length; j++) {
    if (s[j] !== '/') continue;
    const sp1 = s[j - 1] === ' ';
    const sp2 = s[j + 1] === ' ';
    if (sp1 !== sp2) continue;
    const le = sp1 ? j - 1 : j;
    const rs = sp2 ? j + 2 : j + 1;
    let ls = scanLeft(s, le);
    let re = scanRight(s, rs);
    // log 4 / log 3: 함수 이름 + 공백 + 인수
    const fnL = s.slice(0, ls).match(/(log|ln|sin|cos|tan|exp)\s$/);
    if (fnL && le > ls) ls -= fnL[0].length;
    const fnR = s.slice(rs).match(/^(log|ln|sin|cos|tan|exp)\s(?=[A-Za-z0-9(])/);
    if (fnR) re = scanRight(s, rs + fnR[0].length);
    let num = s.slice(ls, le).replace(/^[.·]+/, '');
    let den = s.slice(rs, re).replace(/[.·]+$/, '');
    if (!num || !den) continue;
    const a = le - num.length;
    const b = rs + den.length;
    if (insideExp(s, j)) { left.push(ctx(s, j)); continue; }
    if (num.includes('/') || den.includes('/')) { left.push(ctx(s, j)); continue; }
    const before = s[a - 1] || '';
    const after = s[b] || '';
    if (HAN.test(before) && !/\s/.test(before)) continue;
    if (HAN.test(after) && /^(.)/.test(after) && /[가-힣]/.test(after) && HAN.test(den.slice(-1))) continue;
    if (/[,.\-:\/]/.test(before) && /\d/.test(s[a - 2] || '') && numeric(num)) continue; // 25,000 / 2026.05/3 / 10.0.1.0/24
    if (/^\d+(\.\d+){2,}$/.test(num)) continue; // IP·주소
    if (/^(19|20)\d\d$/.test(num) && /^\d\d$/.test(den)) continue; // 연도 쌍
    if (/\/\s?$/.test(s.slice(0, ls)) || /^\s?\//.test(s.slice(re))) continue; // a/b/c 연쇄(확률 목록, 칸막이 표기)
    if (den === '0' || (numeric(num) && /^(1|0)$/.test(num) && den === '0')) continue; // 1/0 점수 표기
    if (/^\d+\(/.test(den) || /\)$/.test(num) && /^\d+$/.test(num.replace(/\(.*$/, ''))) continue; // 33/150(22.0%) 개수 표기
    const pair = num + '/' + den;
    if (NAMEPAIR.test(pair) || NAMERE.test(pair)) continue;
    if (sp1) {
      // 띄어 쓴 슬래시는 항목 구분(a / b)일 수 있다: 수식 꼴일 때만 분수로 본다
      if (/%$/.test(num) || after === '=') continue; // 0.7% / L=40 km
      if (before === '-' && /[A-Za-z]/.test(s[a - 2] || '')) continue; // n-3 / n-6
      if (numeric(num) && numeric(den) && /^\s[A-Za-zμ°%]/.test(s.slice(b, b + 2))) continue; // 139.4 / 8.6 GPa
    }
    if (pair === 'A/B' && /^\s?[가-힣]/.test(s.slice(b, b + 2))) continue;
    if (/^비/.test(after)) continue; // S/N비, C/N비 같은 이름
    if (/^\d'$/.test(num) || /'$/.test(num) && /'$/.test(den)) continue; // 5'/3' 말단
    if (/°C$/.test(num) && /%/.test(den)) continue; // 85°C/85%RH 조건 표기
    if (/·P$/.test(num) && den === 'F') continue; // P/F비
    if (num.length > 1 && den.length > 1 && elem(num) && elem(den) && !/^[A-Z]$/.test(num + den)) continue; // Cu/Ni, Mg/Ca
    if (/^(UV|LF|FITC|GPi|ChEF|CI|AlGaN|apoB|CD80|Hsp100|H₂O₂)$/.test(num)) continue;
    if (isUnitFraction(num, den)) continue;
    const isNum = (x) => /^[\d.]+$/.test(x);
    if (isNum(num) && isNum(den) && !/\./.test(num + den)) {
      // 정수/정수: 작고 분명한 분수만(혈압·점수·시력 등은 제외)
      const n = +num, d = +den;
      const nice = (n === 1 && d <= 1000) || (n <= 12 && d <= 12 && !(n >= d)) || (n < d && [10, 100, 1000].includes(d) && n <= 9);
      if (!nice) continue;
    }
    const capsAcr = (x) => /^[A-Z][A-Z0-9₀-₉⁺⁻]*$/.test(x) && x.replace(/[^A-Z]/g, '').length >= 3;
    if ((capsAcr(num) || capsAcr(den)) && !numeric(num) && !/[=≈∝]/.test(s)) continue;
    if ((WORDLIKE.test(num) && !MATHWORD.test(num)) || (WORDLIKE.test(den) && !MATHWORD.test(den))) continue;
    if (/^[a-z]{3,}$/.test(num) && /^[a-z]{2,}$/.test(den)) continue;
    const N = stripParens(num);
    const D = stripParens(den);
    const rep = /[{},]/.test(N + D) ? `\\frac{${N}}{${D}}` : `{frac:${N},${D}}`;
    reps.push({ a, b, text: rep, before: s.slice(a, b) });
  }
  reps.sort((x, y) => x.a - y.a);
  let out = '';
  let p = 0;
  for (const r of reps) {
    if (r.a < p) continue;
    out += s.slice(p, r.a) + r.text;
    p = r.b;
    changes.push({ before: r.before, after: r.text });
  }
  out += s.slice(p);
  return { out, changes, left };
}

const findInlineFractions = (s) => convertString(s).changes;

module.exports = { convertString, findInlineFractions };
