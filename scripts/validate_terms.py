# -*- coding: utf-8 -*-
"""용어 데이터 품질 검사기.

terms.json / terms-index.json / terms/*.html / category-data.js 를 교차 검증해
스키마 위반, 중복·표기 흔들림, 영-한 대응 누락, 근거 빈약 항목을 보고한다.

사용법:
    python3 scripts/validate_terms.py            # 레지스트리 검사만(빠름)
    python3 scripts/validate_terms.py --html     # 용어 페이지까지 검사(느림, 3만+ 파일)
"""
import json, re, sys, os, io, collections, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WITH_HTML = "--html" in sys.argv

def load(name):
    return json.load(open(os.path.join(ROOT, name), encoding="utf-8"))

def category_data():
    src = open(os.path.join(ROOT, "assets", "category-data.js"), encoding="utf-8").read()
    labels = dict(re.findall(r'(\w+):\s*"([^"]+)"',
                             src.split("const CATEGORY_LABELS = {")[1].split("\n  };")[0]))
    subs = {k: json.loads(v) for k, v in re.findall(
        r'(\w+):\s*(\[[^\]]*\])',
        src.split("const SUB_CATEGORY_ORDER = {")[1].split("\n  };")[0])}
    return labels, subs

# 표기 흔들림 판정용 정규화: 공백·가운뎃점·괄호·하이픈을 지우고 소문자로.
NORM_STRIP = re.compile(r"[\s·・\-–—_/()\[\]{},.]+")
def norm(s):
    return NORM_STRIP.sub("", unicodedata.normalize("NFKC", s or "")).lower()

def main():
    labels, subs = category_data()
    terms = load("terms.json")
    index = load("terms-index.json")
    findings = collections.defaultdict(list)

    tset = {t["slug"] for t in terms}
    iset = {t["slug"] for t in index}

    # ---------------------------------------------------------- 스키마
    for t in terms:
        s = t.get("slug", "?")
        for field in ("slug", "title_ko", "title_en", "categories", "definition"):
            if not t.get(field):
                findings["schema:필수필드 누락"].append("%s: %s" % (s, field))
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", t.get("slug", "")):
            findings["schema:slug 형식 위반"].append(s)
        for c in t.get("categories") or []:
            if c not in labels:
                findings["schema:존재하지 않는 카테고리"].append("%s -> %s" % (s, c))
        sub = t.get("subcategory")
        cats = t.get("categories") or []
        if sub and cats and cats[0] in subs and sub not in subs[cats[0]]:
            findings["schema:서브카테고리 불일치"].append("%s: %s (%s)" % (s, sub, cats[0]))
        for r in t.get("related") or []:
            if r not in tset:
                findings["schema:끊긴 관련용어 링크"].append("%s -> %s" % (s, r))
            elif r == s:
                findings["schema:자기 자신을 관련용어로 링크"].append(s)

    # 두 레지스트리 정합성
    for s in sorted(tset - iset):
        findings["schema:terms-index에 없음"].append(s)
    for s in sorted(iset - tset):
        findings["schema:terms.json에 없음"].append(s)

    # ------------------------------------------------ 영-한 대응 누락
    for t in terms:
        s, ko, en = t["slug"], t.get("title_ko", ""), t.get("title_en", "")
        if not en:
            findings["대응:영문 표기 없음"].append("%s (%s)" % (s, ko))
        elif en == s and "-" in en:
            # 사람이 쓴 영문명이 아니라 slug 문자열이 그대로 들어간 경우.
            # (정상적인 영문명은 대문자·공백이 있어 slug와 글자까지 같지는 않다)
            findings["대응:영문이 slug 문자열 그대로"].append("%s (%s)" % (s, en))
        elif not re.search(r"[A-Za-z]", en):
            findings["대응:영문에 알파벳 없음"].append("%s (%s)" % (s, en))
        if ko and not re.search(r"[가-힣]", ko):
            findings["대응:한글 표기에 한글 없음"].append("%s (%s)" % (s, ko))

    # ------------------------------------------- 중복 / 표기 흔들림
    by_ko, by_en, by_nko = (collections.defaultdict(list) for _ in range(3))
    for t in terms:
        cats = tuple(t.get("categories") or [])
        if t.get("title_ko"):
            by_ko[t["title_ko"].strip()].append((t["slug"], cats))
            by_nko[norm(t["title_ko"])].append((t["slug"], t["title_ko"], cats))
        if t.get("title_en"):
            by_en[norm(t["title_en"])].append((t["slug"], t["title_en"], cats))

    for ko, v in by_ko.items():
        if len(v) < 2:
            continue
        cs = [set(c) for _, c in v]
        if any(cs[i] & cs[j] for i in range(len(cs)) for j in range(i + 1, len(cs))):
            findings["중복:같은 분야 안 동일 한글명"].append(
                "%s -> %s" % (ko, ", ".join(s for s, _ in v)))

    for nk, v in by_nko.items():
        forms = {ko for _, ko, _ in v}
        if len(forms) > 1:
            findings["표기흔들림:한글 표기 불일치"].append(" / ".join(sorted(forms)))
    for ne, v in by_en.items():
        forms = {en for _, en, _ in v}
        if len(forms) > 1:
            findings["표기흔들림:영문 표기 불일치"].append(" / ".join(sorted(forms)))

    # 같은 한글명인데 영문이 서로 다른 경우(개념 분기 or 번역 흔들림)
    for ko, v in by_ko.items():
        ens = {norm(next((t.get("title_en", "") for t in terms if t["slug"] == s), "")) for s, _ in v}
        if len(v) > 1 and len(ens) > 1:
            findings["표기흔들림:같은 한글명·다른 영문"].append(ko)

    # ------------------------------------------------ 근거 빈약 항목
    for t in terms:
        s = t["slug"]
        if not t.get("related"):
            findings["근거:관련 용어 없음"].append(s)
        d = t.get("definition") or ""
        if d and len(d) < 20:
            findings["근거:정의가 지나치게 짧음"].append("%s (%d자)" % (s, len(d)))
        if not t.get("aliases"):
            findings["검색:동의어(aliases) 비어 있음"].append(s)

    # ---------------------------------------------------- 용어 페이지
    if WITH_HTML:
        tdir = os.path.join(ROOT, "terms")
        files = {n[:-5] for n in os.listdir(tdir) if n.endswith(".html")}
        for s in sorted(tset - files):
            findings["schema:HTML 파일 없음"].append(s)
        for s in sorted(files - tset):
            findings["schema:레지스트리에 없는 HTML"].append(s)
        for s in sorted(tset & files):
            html = open(os.path.join(tdir, s + ".html"), encoding="utf-8").read()
            if 'class="example"' not in html:
                findings["근거:논문 예문 없음"].append(s)
            if "<h2>왜 중요한가</h2>" not in html:
                findings["근거:본문 섹션 누락"].append(s)

    # ------------------------------------------------------------ 보고
    out = io.open(os.path.join(ROOT, "validate_report.txt"), "w", encoding="utf-8")
    out.write("용어 데이터 품질 검사\n")
    out.write("terms.json %d건 / terms-index.json %d건 / 카테고리 %d개\n\n"
              % (len(terms), len(index), len(labels)))
    for key in sorted(findings):
        rows = findings[key]
        out.write("[%s] %d건\n" % (key, len(rows)))
        for r in rows[:15]:
            out.write("    %s\n" % r)
        if len(rows) > 15:
            out.write("    ... 외 %d건\n" % (len(rows) - 15))
        out.write("\n")
    out.close()
    print("검사 완료: validate_report.txt")
    for key in sorted(findings):
        print("%6d  %s" % (len(findings[key]), key))

if __name__ == "__main__":
    main()
