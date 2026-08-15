# -*- coding: utf-8 -*-
"""
term-figure 블록이 이공계 5개 분야(기계/생명/재료/전기전자/화학공학) 카테고리가
아닌 파일에 잘못 삽입된 경우 제거하는 정리 스크립트. (동시 세션 충돌로 커밋된
오탐 다이어그램 정리용)
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TERMS = ROOT / "terms"

ALLOWED_MARKERS = [
    "cat=mechanical", "cat=biotech", "cat=materials", "cat=electrical", "cat=chemeng",
]

FIGURE_RE = re.compile(r'  <figure class="term-figure">.*?</figure>\n\n', re.DOTALL)


def main():
    removed = []
    kept = 0
    for f in sorted(TERMS.glob("*.html")):
        html = f.read_text(encoding="utf-8")
        if 'class="term-figure"' not in html:
            continue
        if any(marker in html for marker in ALLOWED_MARKERS):
            kept += 1
            continue
        new_html, n = FIGURE_RE.subn("", html)
        if n:
            f.write_text(new_html, encoding="utf-8")
            removed.append(f.name)
    print(f"removed: {len(removed)}")
    print(f"kept (allowed category): {kept}")
    Path(ROOT / "scripts" / "_removed_bad_figures.txt").write_text(
        "\n".join(removed), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
