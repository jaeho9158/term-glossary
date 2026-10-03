// type 이름 → 모듈. 순서가 lib.TYPES의 순서가 된다.
"use strict";
const linear = require("./linear.js");

// 프로토타입이 없는 객체: type이 "constructor"·"toString" 같은 값이어도 모듈로 잡히지 않게.
module.exports = Object.assign(Object.create(null), {
  chain: linear.chain,
  contrast: require("./contrast.js"),
  hierarchy: require("./hierarchy.js"),
  procedure: linear.procedure,
  cycle: require("./cycle.js"),
  matrix: require("./matrix.js"),
  venn: require("./venn.js"),
});
