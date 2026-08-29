// 브라우저 전용 스크립트(quiz.js, site.js 등)는 최상위에서 document에 바로
// 접근해 Node에서 require()가 불가능하다. 프로덕션 코드를 건드리지 않고 순수
// 함수만 테스트하기 위해, 소스에서 `function 이름(...){...}` 선언과
// `const 이름 = ...;` 선언을 중괄호 짝 맞추기로 잘라내 vm 샌드박스에서
// 평가한다. 함수가 파일 안에서 이동해도 이름만 유지되면 테스트는 깨지지 않는다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function sliceFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

function sliceConst(src, name) {
  const re = new RegExp(`(?:const|let) ${name} =`);
  const m = src.match(re);
  if (!m) throw new Error(`const ${name} not found`);
  const start = m.index;
  const end = src.indexOf(";", start);
  if (end === -1) throw new Error(`no terminator for ${name}`);
  return src.slice(start, end + 1);
}

// file: 리포지토리 루트 기준 상대 경로. fns/consts: 추출할 이름들.
// globals: 샌드박스에 미리 넣을 전역(스텁). 추출한 이름들을 담은 객체를 반환.
function extract(file, { fns = [], consts = [], globals = {} } = {}) {
  const src = fs
    .readFileSync(path.join(__dirname, "..", "..", file), "utf8")
    .replace(/\r\n/g, "\n");
  const pieces = [
    ...consts.map((n) => sliceConst(src, n)),
    ...fns.map((n) => sliceFunction(src, n)),
  ];
  const names = [...consts, ...fns];
  const code = `${pieces.join("\n")}\n__out__ = { ${names.join(", ")} };`;
  const ctx = vm.createContext({ __out__: null, ...globals });
  vm.runInContext(code, ctx, { filename: file });
  return ctx.__out__;
}

module.exports = { extract };
