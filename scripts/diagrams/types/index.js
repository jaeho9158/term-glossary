// type 이름 → 모듈. 순서가 lib.TYPES의 순서가 된다.
"use strict";
const linear = require("./linear.js");

module.exports = {
  chain: linear.chain,
  contrast: require("./contrast.js"),
  hierarchy: require("./hierarchy.js"),
  procedure: linear.procedure,
};
