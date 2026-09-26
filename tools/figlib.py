#!/usr/bin/env python3
"""
대외활동 기록용 SVG 도식 생성기 — figlib v2

학술대회·산업 포럼·캠프·워크숍 등 모든 대외활동 기록에 쓰는 최소 DSL.
WeasyPrint가 SVG를 벡터로 렌더하므로 확대해도 깨지지 않는다.
v1(K-Brain 시기) 호출 방식과 호환된다.

사용:
    import sys; sys.path.insert(0, '/mnt/user-data/outputs')
    from figlib import Fig, POS, RED, GEN, BAR
    f = Fig(640, 220)
    f.title('A → B → C', align='left')
    f.box(20, 60, 120, 44, '미세아교세포', 'amber', sub='CYR61 분비')
    f.arrow(140, 82, 200, 82, 'CYR61')
    f.note(20, 200, '한계  필요조건까지만 입증', c=RED)
    f.save('/mnt/user-data/outputs/fig_xxx/t01_name.svg')
    f.preview('/home/claude/t01.png')          # QA용 PNG (cairosvg)

v2 변경점
    · text / note / cell / box 라벨의 '\\n' 줄바꿈 (box는 sub와 함께 써도 됨)
    · note(bold=True), title(align='left')
    · band(c=팔레트 이름 또는 '#hex')
    · bars: 음수 값(아래로 뻗는 막대), title, fmt
    · 화살표 머리를 색별 marker로 생성 → cairosvg 미리보기에서도 머리가 보임
    · preview(): PNG 미리보기
"""

PAL = {
    'blue':  ('#dde5f0', '#7f9ac0', '#12305c'),
    'green': ('#e3f1ea', '#5b9b83', '#14543c'),
    'amber': ('#fdf0d8', '#d79a2b', '#7a5210'),
    'rose':  ('#fbe4e4', '#c97b7b', '#7d2626'),
    'gray':  ('#eef1f6', '#aab6c6', '#44546a'),
    'violet':('#eae4f4', '#9382bd', '#3f2f6b'),
}

POS  = '#14543c'   # 주석: 긍정·구제·성과
RED  = '#7d2626'   # 주석: 한계·미해결·위험
GEN  = '#5c6b7f'   # 주석: 일반
NAVY = '#12305c'   # 기본 선·제목

BAR = {'ctrl': '#aab6c6', 'blue': '#7f9ac0', 'green': '#5b9b83',
       'amber': '#d79a2b', 'rose': '#c97b7b', 'violet': '#9382bd'}


def _esc(t):
    return str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class Fig:
    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        self.parts = []
        self._markers = {}
        if bg:
            self.parts.append(f'<rect width="{w}" height="{h}" fill="{bg}"/>')

    # ── 내부: 색별 마커 ───────────────────────────────────
    def _mk(self, kind, c):
        key = (kind, c)
        if key not in self._markers:
            mid = f'{kind}{len(self._markers)}'
            if kind == 'ar':
                d = (f'<marker id="{mid}" markerWidth="9" markerHeight="9" refX="8" refY="4.5" '
                     f'orient="auto"><path d="M0,0.5 L9,4.5 L0,8.5 z" fill="{c}"/></marker>')
            else:
                d = (f'<marker id="{mid}" markerWidth="6" markerHeight="10" refX="3" refY="5" '
                     f'orient="auto"><rect x="0" y="0.5" width="2.6" height="9" fill="{c}"/></marker>')
            self._markers[key] = (mid, d)
        return self._markers[key][0]

    # ── 도형 ──────────────────────────────────────────────
    def box(self, x, y, w, h, label, c='blue', sub=None, fs=10.5, r=6, dash=None):
        fill, stroke, tc = PAL[c]
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.1"{d}/>')
        lines = label.split('\n')
        step = fs + 2.5
        if sub:
            n = len(lines)
            y0 = y + h/2 - 4 - step * (n - 1) / 2
            for i, ln in enumerate(lines):
                self.text(x + w/2, y0 + i * step, ln, fs=fs, c=tc, bold=True)
            self.text(x + w/2, y0 + (n - 1) * step + 13, sub, fs=fs - 1.5, c=tc)
        else:
            y0 = y + h/2 + 3.5 - step * (len(lines) - 1) / 2
            for i, ln in enumerate(lines):
                self.text(x + w/2, y0 + i * step, ln, fs=fs, c=tc, bold=True)
        return (x + w/2, y + h/2)

    def cell(self, cx, cy, rx, ry, label, c='green', fs=10.5):
        """세포(타원). 라벨 줄바꿈 가능"""
        fill, stroke, tc = PAL[c]
        self.parts.append(
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.1"/>')
        self.text(cx, cy + 3.5, label, fs=fs, c=tc, bold=True)

    def band(self, x, y, w, h, label=None, c='gray', fs=9.5):
        """영역 배경 띠. c = 팔레트 이름 또는 '#hex'(채움색)"""
        if c in PAL:
            fill, stroke, tc = PAL[c]
        else:
            fill, stroke, tc = c, '#c8d0dc', PAL['gray'][2]
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="0.8" stroke-dasharray="3,2"/>')
        if label:
            self.text(x + 7, y + 12, label, fs=fs, c=tc, anchor='start', bold=True)

    # ── 연결 ──────────────────────────────────────────────
    def arrow(self, x1, y1, x2, y2, label=None, c=NAVY, w=1.5,
              dash=None, lo=-7, curve=0):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        m = self._mk('ar', c)
        if curve:
            mx, my = (x1+x2)/2, (y1+y2)/2 - curve
            self.parts.append(f'<path d="M{x1},{y1} Q{mx},{my} {x2},{y2}" fill="none" '
                              f'stroke="{c}" stroke-width="{w}"{d} marker-end="url(#{m})"/>')
        else:
            self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" '
                              f'stroke-width="{w}"{d} marker-end="url(#{m})"/>')
        if label:
            mx, my = (x1+x2)/2, (y1+y2)/2 - (curve*0.6 if curve else 0)
            self.text(mx, my + lo, label, fs=9, c=c, bold=True)

    def inhibit(self, x1, y1, x2, y2, label=None, c='#b03a3a', w=1.5, lo=-7):
        """억제 연결(평평한 끝)"""
        m = self._mk('inh', c)
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" '
                          f'stroke-width="{w}" marker-end="url(#{m})"/>')
        if label:
            self.text((x1+x2)/2, (y1+y2)/2 + lo, label, fs=9, c=c, bold=True)

    def blocked(self, x, y, label=None, c='#b03a3a', s=8):
        """차단 표시 ✕"""
        self.parts.append(
            f'<line x1="{x-s}" y1="{y-s}" x2="{x+s}" y2="{y+s}" stroke="{c}" stroke-width="2.4"/>'
            f'<line x1="{x-s}" y1="{y+s}" x2="{x+s}" y2="{y-s}" stroke="{c}" stroke-width="2.4"/>')
        if label:
            self.text(x, y - s - 5, label, fs=8.5, c=c, bold=True)

    # ── 텍스트 ────────────────────────────────────────────
    def text(self, x, y, t, fs=10, c=NAVY, anchor='middle', bold=False, italic=False):
        """'\\n'이 있으면 y를 중심으로 여러 줄을 세로 가운데 정렬"""
        st = f'font-size:{fs}px;fill:{c}'
        if bold:
            st += ';font-weight:700'
        if italic:
            st += ';font-style:italic'
        lines = str(t).split('\n')
        step = fs * 1.25
        y0 = y - step * (len(lines) - 1) / 2
        for i, ln in enumerate(lines):
            self.parts.append(f'<text x="{x}" y="{y0 + i*step:.1f}" text-anchor="{anchor}" '
                              f'style="{st}">{_esc(ln)}</text>')

    def title(self, t, y=15, align='center'):
        if align == 'left':
            self.text(10, y, t, fs=11.5, c=NAVY, anchor='start', bold=True)
        else:
            self.text(self.w/2, y, t, fs=11.5, c=NAVY, bold=True)

    def note(self, x, y, t, c=GEN, fs=8.8, anchor='start', bold=False):
        self.text(x, y, t, fs=fs, c=c, anchor=anchor, bold=bold)

    # ── 막대 차트 ─────────────────────────────────────────
    def bars(self, x, y, w, h, vals, labels, colors=None, ymax=None, unit='',
             title=None, fmt='{:g}'):
        """(x, y) = 차트 영역 좌상단, h = 높이. 양수만이면 v1과 동일.
        음수가 섞이거나 전부 음수면 0 기준선에서 아래로 그린다."""
        n = len(vals)
        pos = max([v for v in vals if v > 0] or [0])
        neg = -min([v for v in vals if v < 0] or [0])
        if pos and neg:
            ymax = ymax or (pos + neg) * 1.25
            uh = h / ymax
            base = y + pos * uh + (h - (pos + neg) * uh) / 2
        elif neg:
            ymax = ymax or neg * 1.25
            uh, base = h / ymax, y
        else:
            ymax = ymax or (pos * 1.25 or 1)
            uh, base = h / ymax, y + h
        bw = w / (n * 1.7)
        gap = (w - n * bw) / (n + 1)
        if title:
            self.text(x + w/2, y - 10, title, fs=9.2, c=NAVY, bold=True)
        self.parts.append(f'<line x1="{x}" y1="{base:.1f}" x2="{x+w}" y2="{base:.1f}" '
                          f'stroke="#aab6c6" stroke-width="1"/>')
        for i, (v, lb) in enumerate(zip(vals, labels)):
            bx = x + gap + i * (bw + gap)
            bh = max(2, abs(v) * uh)
            col = (colors or [BAR['blue']] * n)[i]
            top = base - bh if v >= 0 else base
            self.parts.append(f'<rect x="{bx:.1f}" y="{top:.1f}" width="{bw:.1f}" '
                              f'height="{bh:.1f}" rx="2" fill="{col}"/>')
            vy = top - 4 if v >= 0 else top + bh + 11
            self.text(bx + bw/2, vy, fmt.format(v) + unit, fs=8.5, c='#44546a', bold=True)
            ly = base + 12 if v >= 0 else base - 5
            self.text(bx + bw/2, ly, lb, fs=8.8, c='#44546a')

    # ── 출력 ──────────────────────────────────────────────
    def svg(self):
        defs = '<defs>' + ''.join(d for _, d in self._markers.values()) + '</defs>'
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
                f'<style>text{{font-family:\'Noto Sans CJK KR\',sans-serif}}</style>'
                f'{defs}{"".join(self.parts)}</svg>')

    def save(self, path):
        import os
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fp:
            fp.write(self.svg())
        return path

    def preview(self, png, scale=1.4):
        """QA용 PNG. pip install cairosvg --break-system-packages"""
        import cairosvg
        cairosvg.svg2png(bytestring=self.svg().encode('utf-8'), write_to=png, scale=scale)
        return png
