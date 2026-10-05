// assets/learn-picker.js — 퀴즈·로드맵 공용 분야 칩 선택기 (DOM). 해시(#stat)는 호출하는 쪽이 관리.
// 모양은 용어 허브(.field-chip)와 같게 learn.css에서 다시 정의한다(site.js는 불러오지 않음).
(function (root) {
  async function fetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // { index: {code:{label,group,core}}, popularFields: [code…] } — 실패하면 index null.
  async function loadIndex() {
    const [index, popular] = await Promise.all([
      fetchJson("data/learn/index.json"),
      fetchJson("data/popular-terms.json"),
    ]);
    const fields = popular && Array.isArray(popular._fields) ? popular._fields : [];
    return { index, popularFields: index ? fields.filter((c) => index[c]) : [] };
  }

  function chip(code, label, count, selected, onSelect) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "field-chip";
    b.dataset.code = code;
    b.setAttribute("aria-pressed", selected === code ? "true" : "false");
    b.appendChild(document.createTextNode(label + " "));
    const n = document.createElement("span");
    n.className = "field-chip-count";
    n.textContent = String(count);
    b.appendChild(n);
    b.addEventListener("click", () => onSelect(code));
    return b;
  }

  function section(title, chips) {
    const s = document.createElement("section");
    s.className = "category-group";
    const h = document.createElement("h2");
    h.className = "category-group-title";
    h.textContent = title;
    const w = document.createElement("div");
    w.className = "field-chips";
    chips.forEach((c) => w.appendChild(c));
    s.appendChild(h);
    s.appendChild(w);
    return s;
  }

  // opts: { index, popularFields, groups(CATEGORY_GROUPS), selected, onSelect(code), allCount? }
  function render(container, opts) {
    const { index, popularFields, groups, selected, onSelect } = opts;
    container.textContent = "";
    const pop = [];
    if (opts.allCount) pop.push(chip("all", "전체", opts.allCount, selected, onSelect));
    popularFields.forEach((c) => pop.push(chip(c, index[c].label, index[c].core, selected, onSelect)));
    if (pop.length) container.appendChild(section("많이 찾는 분야", pop));
    for (const g of groups) {
      const cs = g.codes.filter((c) => index[c]).map((c) => chip(c, index[c].label, index[c].core, selected, onSelect));
      if (cs.length) container.appendChild(section(g.label, cs));
    }
  }

  function setSelected(container, selected) {
    container.querySelectorAll(".field-chip").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.code === selected ? "true" : "false");
    });
  }

  root.LearnPicker = { loadIndex, render, setSelected, fetchJson };
})(window);
