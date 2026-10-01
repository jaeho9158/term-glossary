// 분야 페이지 목록 한 줄 설명용 요약. 정의 첫 문장을 maxLen자 이하로 줄이고,
// 잘릴 때는 단어(공백) 경계에서 끊어 "…"를 붙인다.
function shortenText(text, maxLen = 70) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  const room = maxLen - 1; // "…" 자리
  const head = s.slice(0, room + 1);
  const cut = head.lastIndexOf(" ");
  // 공백이 너무 앞에 있으면(첫 단어가 매우 긴 경우) 글자 단위로 자른다.
  const base = cut >= room * 0.5 ? head.slice(0, cut) : s.slice(0, room);
  return base.replace(/[\s,.;:·、，]+$/, "") + "…";
}

module.exports = { shortenText };
