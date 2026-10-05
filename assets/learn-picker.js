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

  // 분야가 선택되면 칩 격자를 접고 "분야: 통계 150 · [분야 바꾸기]" 한 줄만 보여준다.
  // label: 한 줄에 쓸 "통계 150". 선택이 없으면 격자를 펼친 채 둔다.
  function setSelected(container, selected, label) {
    container.querySelectorAll(".field-chip").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.code === selected ? "true" : "false");
    });
    let bar = container._bar;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "lq-fieldbar";
      const t = document.createElement("span");
      t.className = "lq-fieldbar-text";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lq-fieldbar-btn";
      btn.textContent = "분야 바꾸기";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        const open = container.hidden;
        container.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      bar.appendChild(t);
      bar.appendChild(btn);
      container.parentNode.insertBefore(bar, container);
      container._bar = bar;
    }
    bar.hidden = !selected;
    bar.querySelector(".lq-fieldbar-text").textContent = "분야: " + (label || selected);
    bar.querySelector("button").setAttribute("aria-expanded", "false");
    container.hidden = !!selected;
  }

  root.LearnPicker = { loadIndex, render, setSelected, fetchJson };
})(window);
