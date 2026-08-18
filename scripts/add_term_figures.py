# -*- coding: utf-8 -*-
"""
용어 페이지에 카테고리별 재사용 SVG 다이어그램을 자동 삽입하는 스크립트.
- 이미 <figure class="term-figure">가 있으면 건드리지 않음(중복 방지, 재실행 안전).
- 키워드 매칭으로 템플릿을 고르고, 매칭 안 되면 건드리지 않음(추상 개념어는 스킵).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TERMS = ROOT / "terms"

# ---------------------------------------------------------------------------
# 템플릿: (표시 이름, viewBox, svg body, 캡션 템플릿)
# 캡션 템플릿의 {title}은 h1에서 뽑아낸 한글 용어명으로 치환됩니다.
# ---------------------------------------------------------------------------

def tpl_gear():
    return (
        '<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">'
        '<g fill="none" stroke="var(--accent)" stroke-width="4">'
        '<circle cx="100" cy="100" r="45"/>'
        '<circle cx="205" cy="100" r="30"/>'
        '</g>'
        '<g fill="var(--muted)">'
        + "".join(
            f'<rect x="{97}" y="{100-45-10}" width="6" height="10" '
            f'transform="rotate({a} 100 100)"/>'
            for a in range(0, 360, 30)
        )
        + "".join(
            f'<rect x="{202}" y="{100-30-8}" width="6" height="8" '
            f'transform="rotate({a} 205 100)"/>'
            for a in range(0, 360, 36)
        )
        + '</g>'
        '<circle cx="100" cy="100" r="6" fill="var(--text)"/>'
        '<circle cx="205" cy="100" r="6" fill="var(--text)"/>'
        '</svg>',
        "맞물린 두 기어가 회전을 전달하는 기본 구조입니다.",
    )


def tpl_beam():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<line x1="30" y1="90" x2="270" y2="90" stroke="var(--muted)" stroke-width="8" stroke-linecap="round"/>'
        '<path d="M150 20 L150 90" stroke="var(--accent)" stroke-width="4" marker-end="url(#arrow)"/>'
        '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">'
        '<path d="M0,0 L10,5 L0,10 Z" fill="var(--accent)"/></marker></defs>'
        '<polygon points="20,120 40,120 30,100" fill="var(--text)"/>'
        '<polygon points="260,120 280,120 270,100" fill="var(--text)"/>'
        '<line x1="15" y1="120" x2="45" y2="120" stroke="var(--text)" stroke-width="3"/>'
        '<line x1="255" y1="120" x2="285" y2="120" stroke="var(--text)" stroke-width="3"/>'
        '<text x="150" y="140" font-size="12" fill="var(--muted)" text-anchor="middle">지지된 보에 하중이 작용하는 모습</text>'
        '</svg>',
        "구조 부재에 하중이 가해지는 기본 개념을 나타냅니다.",
    )


def tpl_fluid():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<rect x="20" y="60" width="260" height="40" fill="none" stroke="var(--muted)" stroke-width="3" rx="6"/>'
        + "".join(
            f'<path d="M20 {70+i*10} Q 70 {60+i*10} 120 {70+i*10} T 220 {70+i*10} T 280 {70+i*10}" '
            f'fill="none" stroke="var(--accent)" stroke-width="2.5" opacity="{0.9 - i*0.15}"/>'
            for i in range(3)
        )
        + '<polygon points="270,72 288,80 270,88" fill="var(--accent)"/>'
        '<text x="150" y="130" font-size="12" fill="var(--muted)" text-anchor="middle">유체의 흐름 방향을 나타낸 개념도</text>'
        '</svg>',
        "관 또는 유로 내부를 흐르는 유체의 유동 개념을 나타냅니다.",
    )


def tpl_thermal():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<rect x="40" y="40" width="220" height="80" fill="none" stroke="var(--muted)" stroke-width="3" rx="8"/>'
        + "".join(
            f'<line x1="{60+i*40}" y1="120" x2="{60+i*40}" y2="150" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>'
            f'<polygon points="{55+i*40},150 {65+i*40},150 {60+i*40},160" fill="var(--accent)"/>'
            for i in range(5)
        )
        + '<text x="150" y="30" font-size="12" fill="var(--muted)" text-anchor="middle">고온측</text>'
        '<text x="150" y="100" font-size="12" fill="var(--text)" text-anchor="middle">열 전달</text>'
        '</svg>',
        "열이 고온부에서 저온부로 이동하는 열전달 개념을 나타냅니다.",
    )


def tpl_vibration():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<path d="M20 80 Q 57.5 20 95 80 T 170 80 T 245 80 T 280 80" '
        'fill="none" stroke="var(--accent)" stroke-width="3"/>'
        '<line x1="20" y1="80" x2="280" y2="80" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 4"/>'
        '<text x="150" y="140" font-size="12" fill="var(--muted)" text-anchor="middle">시간에 따른 진동/파형 변화</text>'
        '</svg>',
        "시간에 따라 반복되는 진동 또는 파형의 개념을 나타냅니다.",
    )


def tpl_linkage():
    return (
        '<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">'
        '<line x1="60" y1="160" x2="240" y2="160" stroke="var(--border)" stroke-width="2" stroke-dasharray="4 4"/>'
        '<line x1="60" y1="160" x2="80" y2="60" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>'
        '<line x1="80" y1="60" x2="220" y2="70" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>'
        '<line x1="220" y1="70" x2="240" y2="160" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>'
        '<line x1="60" y1="160" x2="240" y2="160" stroke="var(--muted)" stroke-width="5" stroke-linecap="round"/>'
        + "".join(
            f'<circle cx="{x}" cy="{y}" r="6" fill="var(--text)"/>'
            for x, y in [(60, 160), (80, 60), (220, 70), (240, 160)]
        )
        + '<text x="150" y="185" font-size="12" fill="var(--muted)" text-anchor="middle">링크(막대)와 관절로 이루어진 기구 구조</text>'
        '</svg>',
        "여러 링크(막대)와 관절로 이루어져 특정 운동을 만들어내는 기구의 기본 구조입니다.",
    )


def tpl_sensor():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<rect x="120" y="60" width="60" height="40" rx="6" fill="none" stroke="var(--accent)" stroke-width="4"/>'
        '<line x1="150" y1="60" x2="150" y2="30" stroke="var(--muted)" stroke-width="3"/>'
        '<circle cx="150" cy="24" r="6" fill="var(--muted)"/>'
        '<path d="M180 80 Q 220 80 220 40" fill="none" stroke="var(--text)" stroke-width="2" stroke-dasharray="3 3"/>'
        '<polyline points="230,20 245,60 260,10 275,50" fill="none" stroke="var(--accent)" stroke-width="2.5"/>'
        '<text x="150" y="130" font-size="12" fill="var(--muted)" text-anchor="middle">센서가 신호를 측정·기록하는 개념</text>'
        '</svg>',
        "대상의 물리량을 센서로 측정하고 신호로 기록하는 계측 개념을 나타냅니다.",
    )


def tpl_composite():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        + "".join(
            f'<rect x="40" y="{30+i*22}" width="220" height="16" '
            f'fill="{"var(--accent)" if i % 2 == 0 else "var(--card-bg)"}" '
            f'stroke="var(--muted)" stroke-width="1.5"/>'
            for i in range(5)
        )
        + '<text x="150" y="150" font-size="12" fill="var(--muted)" text-anchor="middle">적층된 층 구조(레이어)</text>'
        '</svg>',
        "서로 다른 층(레이어)이 겹겹이 쌓인 적층 구조를 나타냅니다.",
    )


def tpl_rotation():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<line x1="20" y1="80" x2="280" y2="80" stroke="var(--muted)" stroke-width="6" stroke-linecap="round"/>'
        '<ellipse cx="150" cy="80" rx="14" ry="40" fill="none" stroke="var(--accent)" stroke-width="3"/>'
        '<path d="M150 40 A 40 40 0 1 1 149 40" fill="none" stroke="var(--accent)" stroke-width="2" '
        'stroke-dasharray="4 3" marker-end="url(#rot)"/>'
        '<defs><marker id="rot" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">'
        '<path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)"/></marker></defs>'
        '<text x="150" y="140" font-size="12" fill="var(--muted)" text-anchor="middle">축을 중심으로 회전하는 구조</text>'
        '</svg>',
        "회전축을 중심으로 부품이 회전하는 기본 구조를 나타냅니다.",
    )


def tpl_circuit():
    return (
        '<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">'
        '<rect x="30" y="60" width="240" height="40" fill="none" stroke="var(--muted)" stroke-width="2" rx="6"/>'
        + "".join(
            f'<circle cx="{60+i*45}" cy="80" r="10" fill="none" stroke="var(--accent)" stroke-width="3"/>'
            for i in range(5)
        )
        + '<text x="150" y="130" font-size="12" fill="var(--muted)" text-anchor="middle">신호/전류가 소자를 거쳐 흐르는 회로 개념</text>'
        '</svg>',
        "여러 소자를 거쳐 신호나 전류가 흐르는 회로의 기본 개념을 나타냅니다.",
    )


# 키워드(파일명/제목 기준) -> 템플릿 매핑. 위에서부터 먼저 매칭되는 것을 사용.
# 인문/사회 용어에도 걸리는 범용어("구조", "링크", "흐름", "회로" 등)는 넣지 않는다 —
# 오탐(예: 어학 "논항구조", 인구학 "연령구조")을 막기 위해 공학적 문맥이 뚜렷한 단어만 사용.
KEYWORD_TEMPLATES = [
    (["gear", "톱니", "기어"], tpl_gear),
    (["linkage", "링크", "cam-follower", "캠", "manipulator", "jacobian"], tpl_linkage),
    (["beam", "buckling", "fatigue", "fracture", "j-integral", "구조", "좌굴", "피로", "파괴", "bolted", "preload", "sandwich", "honeycomb"], tpl_beam),
    (["flow", "fluid", "유동", "cavitation", "공동", "compressor", "compressible", "hydraulic", "유압", "microfluidic"], tpl_fluid),
    (["thermal", "heat", "열", "combustion", "연소", "engine", "엔진"], tpl_thermal),
    (["vibration", "진동", "modal", "resonator", "gyroscopic", "파형", "wave"], tpl_vibration),
    (["sensor", "센서", "measurement", "계측", "monitoring", "vibrometry", "correlation", "kalman"], tpl_sensor),
    (["composite", "laminate", "복합재", "적층", "layer"], tpl_composite),
    (["bearing", "베어링", "rotor", "로터", "회전"], tpl_rotation),
    (["circuit", "회로", "electro", "전자"], tpl_circuit),
]

# 그림을 붙일 대상은 이공계 카테고리로 한정한다 (인문/사회/법/문학 등은 제외).
# 반드시 카테고리 뱃지 문자열로 게이트한 뒤에만 위 범용 키워드를 적용해야
# 안전하다(게이트 없이 전체 사이트에 적용하면 인문/사회 용어에 오탐 발생).
ALLOWED_CATEGORY_MARKERS = [
    "cat=mechanical", "cat=biotech", "cat=materials", "cat=electrical", "cat=chemeng",
    "cat=robotics", "cat=aviation", "cat=naval", "cat=medlab", "cat=radio", "cat=ocean",
]
# cs/physchem/aviation/naval은 시도했으나 범용 키워드가 해당 분야
# 특유의 비물리적 의미(beam-search, buffer-overflow 등)와 충돌해 오탐이 발생,
# 제외함. 확장하려면 카테고리별 화이트리스트 방식으로 다시 설계해야 함.

# 카테고리 게이트를 통과해도 키워드 매칭이 실제로는 부적절한 개별 용어
# (추상적 알고리즘/수학 개념이 물리적 키워드와 우연히 겹치는 경우) 예외 처리.
EXCLUDED_SLUGS = {
    "structure-from-motion",  # "구조" 매칭이지만 컴퓨터비전 3D 복원 알고리즘, 보/구조물 아님
    "rotation-matrix",  # "회전" 매칭이지만 추상적 수학 행렬, 물리적 회전축 아님
    "aircraft-rescue-and-firefighting",  # "구조"가 "구조업무"(rescue)의 일부, 보/구조물 아님
    "stabilator",  # "전자"가 "전자세"(all-moving)의 일부, 전자회로 아님
    "camber",  # "캠"이 "캠버"의 일부, 캠-폴로어 기구 아님
    "fatigue-risk-management-system",  # 승무원(인체) 피로 관리, 재료 피로 아님
    "air-traffic-flow-management",  # 항공교통 스케줄링 개념, 관내 유체흐름 아님
    "land-reclamation-engineering",  # "engineering"의 "engine" 부분매칭, 매립공학이며 엔진 아님
    "burst-pressure",  # "파열"의 "열" 부분매칭, 파열압력이며 열전달 아님
    "towed-array-sonar",  # "배열"의 "열" 부분매칭, 소나 배열이며 열전달 아님
    "corrugated-bulkhead",  # 정적인 파형 형태의 격벽, 시간에 따른 진동/파형 아님
    "antibiotic-resistance-gene-test",  # "유전자"의 "전자" 부분매칭, 유전자검사이며 전자회로 아님
    "isothermal-amplification",  # 등온(온도 일정)인데 열전달(고온→저온) 캡션과 개념 모순
    # 방사선학(radio)에서 "beam"은 광선/전자선(물리) 의미인데, tpl_beam()은
    # 구조공학의 "하중 받는 보"를 그리므로 근본적으로 개념이 다름 — 전부 제외.
    "beam-collimation", "beam-energy", "beam-hardening", "beam-modifier",
    "electron-beam-therapy", "photon-beam-therapy",
    "structured-reporting",  # "구조화"의 "구조" 부분매칭, 표준화된 판독보고서 형식이며 물리적 구조물 아님
    "incidental-finding",  # "우연소견"의 "연소" 부분매칭, 우연히 발견된 소견이며 연소(combustion) 아님
    "positron-emission-tomography", "positron-emission",  # "양전자"의 "전자" 부분매칭, 방사성붕괴 현상이며 회로 아님
    "half-value-layer",  # 차폐물 두께 하나의 값이며, 여러 층이 쌓인 적층구조 아님
    "ecosystem-engineer-marine",  # 영문 "engineer"의 "engine" 부분매칭, 생태계공학종이며 엔진 아님
    "subtropical-gyre",  # "아열대"의 "열" 부분매칭, 해류순환이며 열전달 아님
    "planktonic-community-structure", "population-genetic-structure-marine",  # 군집/유전 구조(추상적 개념), 물리적 보 아님
}


def pick_template(filename: str, title: str, html: str):
    if filename in EXCLUDED_SLUGS:
        return None
    if not any(marker in html for marker in ALLOWED_CATEGORY_MARKERS):
        return None
    hay = (filename + " " + title).lower()
    for keywords, fn in KEYWORD_TEMPLATES:
        for kw in keywords:
            if kw.lower() in hay:
                return fn
    return None


def process_file(path: Path) -> str:
    html = path.read_text(encoding="utf-8")

    if 'class="term-figure"' in html:
        return "skip-exists"

    m = re.search(r"<h1>(.*?)</h1>", html)
    title = re.sub(r"<.*?>", "", m.group(1)) if m else path.stem

    tpl_fn = pick_template(path.stem, title, html)
    if tpl_fn is None:
        return "skip-no-match"

    svg, caption = tpl_fn()
    figure_html = (
        f'  <figure class="term-figure">\n    {svg}\n'
        f'    <figcaption>{caption}</figcaption>\n  </figure>\n\n  <h2>쉽게 풀면</h2>'
    )

    new_html, n = re.subn(r"  <h2>쉽게 풀면</h2>", figure_html, html, count=1)
    if n == 0:
        return "skip-no-anchor"

    path.write_text(new_html, encoding="utf-8")
    return "added"


def main():
    only_category = sys.argv[1] if len(sys.argv) > 1 else None
    files = sorted(TERMS.glob("*.html"))
    if only_category:
        files = [f for f in files if only_category in f.read_text(encoding="utf-8")]

    stats = {}
    for f in files:
        result = process_file(f)
        stats[result] = stats.get(result, 0) + 1

    for k, v in sorted(stats.items()):
        print(f"{k}: {v}")
    print(f"total scanned: {len(files)}")


if __name__ == "__main__":
    main()
