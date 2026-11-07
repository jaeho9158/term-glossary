// TEST_SLUGS="a,b"이면 순회형 테스트가 그 slug만 본다(npm run test:fast). 없으면 전체.
const ONLY = process.env.TEST_SLUGS != null ? new Set(process.env.TEST_SLUGS.split(/[,\s]+/).filter(Boolean)) : null;
const keep = (slug) => !ONLY || ONLY.has(slug);
module.exports = { ONLY, keep };
