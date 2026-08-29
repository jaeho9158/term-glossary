// 사이트 전역 설정의 단일 출처.
//
// BASE_URL이 스크립트 3곳(generate-sitemap / generate-feed / generate-en-pages)에
// 각각 하드코딩돼 있던 시절, 한 곳에 남은 옛 github.io 주소 때문에 sitemap의
// 37,000여 개 URL이 통째로 옛 주소로 되돌아간 사고가 있었다. 도메인이 바뀌면
// 반드시 이 파일 한 곳만 고칠 것.
const BASE_URL = "https://termglossary.kr";

module.exports = { BASE_URL };
