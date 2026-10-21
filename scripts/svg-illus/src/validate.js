// 스펙 검증. validate(spec)은 오류 메시지 배열을 돌려준다(비면 통과).

export class SpecError extends Error {
  constructor(errors) {
    super('스펙 오류 ' + errors.length + '건:\n- ' + errors.join('\n- '));
    this.name = 'SpecError';
    this.errors = errors;
  }
}

const REQ = {
  line: ['from', 'to'], arrow: ['from', 'to'], circle: ['center', 'r'], ellipse: ['center', 'rx', 'ry'],
  polygon: ['points'], polyline: ['points'], rect: [], arc: ['center', 'r'], curve: [], text: ['at', 'text'],
  hatch: [], dot: ['at'], marker: ['at', 'n'], rightAngle: ['at', 'dir1', 'dir2'], path: ['d'], group: ['elements'],
};
export const ELEMENT_TYPES = Object.keys(REQ);
const KINDS = ['var', 'expr', 'func', 'const', 'abbr', 'term', 'unit', 'note'];
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function checkPoint(p, where, names, errs) {
  if (typeof p === 'string') { if (!names.has(p)) errs.push(`${where}: 정의되지 않은 점 이름 "${p}"(spec.points에 넣으세요)`); return; }
  if (Array.isArray(p)) { if (p.length !== 2 || !p.every(isNum)) errs.push(`${where}: 점은 [x, y] 숫자 두 개여야 합니다`); return; }
  if (p && typeof p === 'object' && Array.isArray(p.polar)) {
    if (p.polar.length !== 2 || !p.polar.every(isNum)) errs.push(`${where}.polar: [반지름, 각도(도)]여야 합니다`);
    if (p.from !== undefined) checkPoint(p.from, where + '.from', names, errs);
    return;
  }
  errs.push(`${where}: 점 형식이 아닙니다([x,y], 점 이름, {polar:[r,deg], from})`);
}

const MATH_NAMES = new Set(Object.getOwnPropertyNames(Math));
export function checkExpr(expr) {
  if (typeof expr !== 'string') return '수식은 문자열이어야 합니다';
  if (!/^[0-9a-zA-Z_+\-*/%^().,\s<>=?:!&|]*$/.test(expr)) return `수식에 쓸 수 없는 문자가 있습니다: ${expr}`;
  const words = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const bad = words.filter(w => w !== 'x' && w !== 't' && !MATH_NAMES.has(w));
  if (bad.length) return `수식에 알 수 없는 이름: ${bad.join(', ')} (x와 Math의 함수·상수만 씁니다)`;
  return null;
}

function checkElements(list, where, names, errs) {
  if (!Array.isArray(list)) { errs.push(`${where}: 배열이어야 합니다`); return; }
  list.forEach((el, i) => {
    const w = `${where}[${i}]`;
    if (!el || typeof el !== 'object') { errs.push(`${w}: 객체여야 합니다`); return; }
    if (!REQ[el.type]) { errs.push(`${w}.type: 알 수 없는 요소 "${el.type}" (가능: ${ELEMENT_TYPES.join(', ')})`); return; }
    for (const k of REQ[el.type]) if (el[k] === undefined) errs.push(`${w}: ${el.type}에는 "${k}"가 필요합니다`);
    for (const k of ['from', 'to', 'center', 'at']) if (el[k] !== undefined) checkPoint(el[k], `${w}.${k}`, names, errs);
    if (el.points !== undefined) {
      if (!Array.isArray(el.points) || el.points.length < 2) errs.push(`${w}.points: 점 두 개 이상의 배열이어야 합니다`);
      else el.points.forEach((p, j) => checkPoint(p, `${w}.points[${j}]`, names, errs));
    }
    for (const k of ['r', 'rx', 'ry', 'w', 'h']) if (el[k] !== undefined && !(isNum(el[k]) && el[k] >= 0)) errs.push(`${w}.${k}: 0 이상의 숫자여야 합니다`);
    if (el.type === 'rect' && !(el.from && el.to) && !(isNum(el.x) && isNum(el.y) && isNum(el.w) && isNum(el.h)))
      errs.push(`${w}: rect에는 x,y,w,h 또는 from,to가 필요합니다`);
    if (el.type === 'arc' && !(isNum(el.start) && isNum(el.end)) && !Array.isArray(el.between))
      errs.push(`${w}: arc에는 start,end(도) 또는 between:[점, 점]이 필요합니다`);
    if (el.type === 'arc' && Array.isArray(el.between)) el.between.forEach((p, j) => checkPoint(p, `${w}.between[${j}]`, names, errs));
    if (el.type === 'curve') {
      if (el.fn !== undefined) {
        const e = typeof el.fn === 'function' ? null : checkExpr(el.fn); if (e) errs.push(`${w}.fn: ${e}`);
        if (!Array.isArray(el.domain) || el.domain.length !== 2 || !el.domain.every(isNum)) errs.push(`${w}.domain: [시작, 끝] 숫자가 필요합니다`);
      } else if (el.points === undefined) errs.push(`${w}: curve에는 fn+domain 또는 points가 필요합니다`);
    }
    if (el.type === 'hatch' && !el.points && !(isNum(el.x) && isNum(el.y) && isNum(el.w) && isNum(el.h)))
      errs.push(`${w}: hatch에는 points(다각형) 또는 x,y,w,h가 필요합니다`);
    if (el.type === 'text' && typeof el.text !== 'string' && !isNum(el.text)) errs.push(`${w}.text: 문자열이어야 합니다`);
    if (el.anchor !== undefined && !['start', 'middle', 'end'].includes(el.anchor)) errs.push(`${w}.anchor: start, middle, end 중 하나여야 합니다`);
    if (el.type === 'group') checkElements(el.elements, `${w}.elements`, names, errs);
  });
}

export function validate(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['스펙은 객체여야 합니다'];
  if (!(isNum(spec.width) && spec.width > 0)) errs.push('width: 양수여야 합니다');
  if (!(isNum(spec.height) && spec.height > 0)) errs.push('height: 양수여야 합니다');
  if (spec.id !== undefined && !/^[A-Za-z][\w-]*$/.test(spec.id)) errs.push('id: 영문자로 시작하는 영문·숫자·-·_ 이어야 합니다');
  const names = new Set();
  if (spec.points !== undefined) {
    if (typeof spec.points !== 'object' || Array.isArray(spec.points)) errs.push('points: {이름: [x,y]} 객체여야 합니다');
    else for (const k of Object.keys(spec.points)) names.add(k);
    for (const [k, p] of Object.entries(spec.points || {})) checkPoint(p, `points.${k}`, names, errs);
  }
  if (spec.frame !== undefined) {
    const f = spec.frame;
    if (!f || !Array.isArray(f.origin) || !f.origin.every(isNum)) errs.push('frame.origin: [x, y] 픽셀 좌표가 필요합니다');
    if (f && !(isNum(f.scale) || (Array.isArray(f.scale) && f.scale.length === 2 && f.scale.every(isNum)))) errs.push('frame.scale: 숫자 또는 [kx, ky]여야 합니다');
  }
  if (spec.axes !== undefined) for (const ax of ['x', 'y']) {
    const a = spec.axes[ax];
    if (a && !(isNum(a.min) && isNum(a.max) && a.max > a.min)) errs.push(`axes.${ax}: min < max 숫자가 필요합니다`);
  }
  checkElements(spec.elements ?? [], 'elements', names, errs);
  if (spec.legend !== undefined) {
    if (!Array.isArray(spec.legend)) errs.push('legend: 배열이어야 합니다');
    else spec.legend.forEach((it, i) => {
      if (!it || typeof it.desc !== 'string') errs.push(`legend[${i}].desc: 설명 문자열이 필요합니다`);
      if (it && it.kind !== undefined && !KINDS.includes(it.kind)) errs.push(`legend[${i}].kind: 알 수 없는 kind "${it.kind}" (가능: ${KINDS.join(', ')})`);
    });
  }
  if (spec.table !== undefined) {
    const t = spec.table;
    if (!t || !Array.isArray(t.rows)) errs.push('table.rows: 배열이 필요합니다');
    else t.rows.forEach((r, i) => { if (!Array.isArray(r)) errs.push(`table.rows[${i}]: 배열이어야 합니다`); });
  }
  return errs;
}
