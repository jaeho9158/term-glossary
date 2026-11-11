// 코드 그림(figure.si-figure)이 있는 페이지에만 그림 받기 스크립트 태그를 둔다(멱등).
const TAG = '<script src="../assets/figure-download.js"></script>';
const BACK = '<script src="../assets/term-back-nav.js"></script>';

function syncFigureDownloadTag(html) {
  if (html == null) return html;
  const has = html.includes(TAG);
  const want = html.includes('class="si-figure');
  if (has === want) return html;
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  if (!want) return html.split(TAG + nl).join("").split(TAG).join("");
  if (html.includes(BACK)) return html.replace(BACK, BACK + nl + TAG);
  return html.replace("</body>", TAG + nl + "</body>");
}

module.exports = { syncFigureDownloadTag };
