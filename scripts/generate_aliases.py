# -*- coding: utf-8 -*-
"""검색용 동의어(aliases) 자동 생성.

헤더 검색은 title_ko / title_en / aliases 세 필드를 Fuse로 훑는데, aliases가
대부분 비어 있어 "띄어쓰기를 다르게 쳤다", "약어로 쳤다", "괄호 안 표기로
쳤다" 같은 흔한 입력이 검색되지 않았다. 규칙만으로 안전하게 만들 수 있는
표기 변형만 생성한다(형태소 분석기 없이 복합어를 쪼개지는 않는다).

사용법:
    python3 scripts/generate_aliases.py --dry-run   # 생성량만 확인
    python3 scripts/generate_aliases.py             # terms.json/terms-index.json 반영
"""
import json, re, sys, os, io, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--dry-run" in sys.argv

PAREN = re.compile(r"\(([^)]*)\)")
SEPS = re.compile(r"[·・\-–—/]+")
STOP_EN = {"of", "the", "and", "in", "for", "to", "a", "an", "on", "with", "by"}

def variants(title_ko, title_en):
    """한 용어에서 뽑아낼 수 있는 표기 변형들."""
    out = set()

    # --- 한글 표기 ---
    if title_ko:
        base = PAREN.sub("", title_ko).strip()
        if base and base != title_ko:
            out.add(base)                      # 괄호 병기를 뗀 형태
        for inner in PAREN.findall(title_ko):
            inner = inner.strip()
            # 괄호 안이 영문 약어이거나 다른 우리말 표기인 경우 둘 다 검색어가 된다
            if 1 < len(inner) <= 30:
                out.add(inner)
        for form in {title_ko, base}:
            if not form:
                continue
            if " " in form:
                out.add(form.replace(" ", ""))  # 붙여 쓴 형태
            if SEPS.search(form):
                out.add(SEPS.sub("", form))     # 가운뎃점·하이픈을 뗀 형태
                out.add(SEPS.sub(" ", form).strip())

    # --- 영문 두문자어 ---
    if title_en:
        clean = PAREN.sub("", title_en).strip()
        words = [w for w in re.split(r"[\s\-]+", clean) if w]
        content = [w for w in words if w.lower() not in STOP_EN]
        if 2 <= len(content) <= 5 and all(re.match(r"[A-Za-z]", w) for w in content):
            acro = "".join(w[0].upper() for w in content)
            if 2 <= len(acro) <= 5:
                out.add(acro)
        for inner in PAREN.findall(title_en):
            inner = inner.strip()
            if 1 < len(inner) <= 30:
                out.add(inner)

    return {v for v in (x.strip() for x in out) if v}

def main():
    tpath = os.path.join(ROOT, "terms.json")
    ipath = os.path.join(ROOT, "terms-index.json")
    terms = json.load(open(tpath, encoding="utf-8"))
    index = json.load(open(ipath, encoding="utf-8"))

    # 이미 쓰이고 있는 표제어·약어와 부딪히는 별칭은 만들지 않는다.
    # (검색 결과에서 엉뚱한 용어가 정답을 밀어내는 것을 막기 위함)
    taken = collections.Counter()
    for t in terms:
        for f in (t.get("title_ko"), t.get("title_en")):
            if f:
                taken[f.strip().lower()] += 1

    proposed = collections.defaultdict(set)
    for t in terms:
        cur = {a.strip().lower() for a in (t.get("aliases") or [])}
        own = {(t.get("title_ko") or "").strip().lower(),
               (t.get("title_en") or "").strip().lower()}
        for v in variants(t.get("title_ko", ""), t.get("title_en", "")):
            lv = v.lower()
            if lv in cur or lv in own:
                continue
            if taken.get(lv):          # 다른 용어의 표제어와 같은 문자열
                continue
            proposed[t["slug"]].add(v)

    # 여러 용어가 같은 별칭을 주장하면(주로 약어 충돌) 모두 버린다.
    claims = collections.Counter()
    for slug, vs in proposed.items():
        for v in vs:
            claims[v.lower()] += 1
    dropped = 0
    for slug in list(proposed):
        keep = {v for v in proposed[slug] if claims[v.lower()] == 1}
        dropped += len(proposed[slug]) - len(keep)
        proposed[slug] = keep

    added = sum(len(v) for v in proposed.values())
    touched = sum(1 for v in proposed.values() if v)
    print("별칭 추가 대상 용어 %d개 / 새 별칭 %d개 (충돌로 버린 것 %d개)"
          % (touched, added, dropped))
    for slug in list(proposed)[:8]:
        if proposed[slug]:
            print("   %-40s %s" % (slug, sorted(proposed[slug])))

    if DRY:
        return
    for data, path in ((terms, tpath), (index, ipath)):
        for t in data:
            extra = proposed.get(t["slug"])
            if not extra:
                continue
            cur = list(t.get("aliases") or [])
            seen = {c.strip().lower() for c in cur}
            for v in sorted(extra):
                if v.lower() not in seen:
                    cur.append(v); seen.add(v.lower())
            t["aliases"] = cur
        json.dump(data, io.open(path, "w", encoding="utf-8"), ensure_ascii=False,
                  indent=None if path.endswith("terms-index.json") else 2,
                  separators=(",", ":") if path.endswith("terms-index.json") else None)
    print("terms.json / terms-index.json 반영 완료")

if __name__ == "__main__":
    main()
