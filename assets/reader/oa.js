// 오픈 액세스 도구: 핵심 선행논문 3편, DOI·arXiv로 바로 열기, AI로 넘기기.
// OpenAlex는 키 없이 쓴다. 요청에 이메일·mailto·사용자 지정 헤더를 넣지 않는다(사이트 규칙).
// 선행논문 조회는 사용자가 버튼을 누를 때만 하고, 보내는 것은 논문의 DOI 하나뿐이다.
(function (root) {
  "use strict";

  var API = "https://api.openalex.org/works";
  var PROMPT = "다음 논문 구절을 쉽게 설명해 줘";
  var AI_URLS = { chatgpt: "https://chatgpt.com/", claude: "https://claude.ai/new" };

  // ---------- 순수 함수 ----------

  function cleanDoi(s) {
    s = String(s).replace(/[.,;:\]}>"']+$/, "");
    // 끝 ")"는 짝이 안 맞을 때만 떼어 낸다("(10.1/x)" → 10.1/x, "10.1002/abc(x)"는 그대로)
    while (/\)$/.test(s) && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) s = s.slice(0, -1).replace(/[.,;:]+$/, "");
    return s.toLowerCase();
  }

  // 글 안의 첫 DOI(없으면 null)
  function findDoi(text) {
    var m = /\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(String(text || ""));
    return m ? cleanDoi(m[1]) : null;
  }

  // 글 안의 첫 arXiv 번호(새 형식 YYMM.NNNNN, 판 번호 vN 포함 가능)
  function findArxiv(text) {
    var m = /arxiv[:\s/]*(?:abs\/|pdf\/)?(\d{4}\.\d{4,5})(v\d+)?/i.exec(String(text || ""));
    return m ? m[1] + (m[2] || "") : null;
  }

  // 입력창 값 → {type:"doi", doi} | {type:"arxiv", id} | null
  function parseOaInput(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    var a = /^(?:https?:\/\/)?(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?\/?$/i.exec(s)
      || /^(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i.exec(s);
    if (a) return { type: "arxiv", id: a[1] };
    var d = /^(?:https?:\/\/)?(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i.exec(s) || /^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i.exec(s);
    if (d) {
      var doi = cleanDoi(decodeURIComponent(d[1]));
      var ax = /^10\.48550\/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)$/i.exec(doi);
      return ax ? { type: "arxiv", id: ax[1] } : { type: "doi", doi: doi };
    }
    return null;
  }

  // 인용 수가 많은 순으로 n편. 같으면 원래 순서.
  function topCited(works, n) {
    return (works || []).filter(function (w) { return w && typeof w.cited_by_count === "number"; })
      .map(function (w, i) { return { w: w, i: i }; })
      .sort(function (a, b) { return b.w.cited_by_count - a.w.cited_by_count || a.i - b.i; })
      .slice(0, n || 3).map(function (x) { return x.w; });
  }

  // OpenAlex work → 화면에 쓸 값
  function summarize(w) {
    var loc = w.primary_location || {};
    var oa = w.open_access || {};
    return {
      title: w.display_name || w.title || "(제목 없음)",
      year: w.publication_year || "",
      venue: (loc.source && loc.source.display_name) || "",
      cites: w.cited_by_count || 0,
      url: oa.oa_url || w.doi || w.id || "",
    };
  }

  // 열 수 있는 PDF 주소(없으면 null)와 볼 수 있는 쪽 주소
  function oaPdfOf(w) {
    var best = (w && w.best_oa_location) || {};
    // 대표 공개본에 PDF 주소가 없으면 다른 공개본(저장소 사본 등)에서 찾는다
    var alt = ((w && w.locations) || []).filter(function (l) { return l && l.is_oa && l.pdf_url; })[0] || {};
    return { pdf: best.pdf_url || alt.pdf_url || null, page: best.landing_page_url || (w && w.open_access && w.open_access.oa_url) || null };
  }

  var PURE = { findDoi: findDoi, findArxiv: findArxiv, parseOaInput: parseOaInput, topCited: topCited, summarize: summarize, oaPdfOf: oaPdfOf };
  if (typeof module !== "undefined" && module.exports) { module.exports = PURE; return; }

  // ---------- 브라우저 ----------

  function $(id) { return document.getElementById(id); }
  function cacheGet(k) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function cacheSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 그만 */ } }

  async function getJson(url) {
    var res = await fetch(url, { credentials: "omit" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }

  function doiOfArxiv(id) { return "10.48550/arxiv." + id.replace(/v\d+$/, "").toLowerCase(); }

  // 열린 문서의 DOI: 앞 두 쪽 글에서 DOI, 없으면 arXiv 번호
  async function docDoi() {
    var D = root.ReaderDoc, text = "";
    var n = Math.min(2, D.numPages() || 0);
    for (var p = 1; p <= n; p++) {
      var tc = await D.getTextContent(p);
      text += " " + tc.items.map(function (it) { return it.str; }).join(" ");
    }
    var doi = findDoi(text);
    if (doi) return doi;
    var ax = findArxiv(text);
    return ax ? doiOfArxiv(ax) : null;
  }

  // ---------- 1. 핵심 선행논문 ----------
  var priorToken = 0;

  function renderPrior(box, state) {
    box.textContent = "";
    var h = document.createElement("h3");
    h.className = "current-page-terms-title";
    h.textContent = "핵심 선행논문";
    box.appendChild(h);
    if (state.msg) {
      var p = document.createElement("p");
      p.className = "rd-lookup-none";
      p.textContent = state.msg;
      box.appendChild(p);
      return;
    }
    var ol = document.createElement("ol");
    ol.className = "rd-prior-list";
    state.items.forEach(function (it) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = it.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = it.title;
      var meta = document.createElement("div");
      meta.className = "rd-prior-meta";
      meta.textContent = [it.year, it.venue, "인용 " + it.cites.toLocaleString("ko-KR") + "회"].filter(Boolean).join(" · ");
      li.appendChild(a);
      li.appendChild(meta);
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  async function showPrior() {
    var box = $("rd-prior");
    box.hidden = false;
    if (root.ReaderPanels && root.ReaderPanels.open) root.ReaderPanels.open("right");
    var my = ++priorToken;
    renderPrior(box, { msg: "불러오는 중…" });
    var state;
    try {
      var doi = await docDoi();
      if (!doi) state = { msg: "이 논문에서 DOI를 찾지 못했어요." };
      else {
        var key = "rd-prior:" + doi;
        var items = cacheGet(key);
        if (!items) {
          var work = await getJson(API + "/doi:" + encodeURIComponent(doi) + "?select=id");
          if (!work) items = null;
          else {
            var id = String(work.id).split("/").pop();
            // cited_by:W = 이 논문이 인용한 문헌(참고문헌). 서버에서 인용 수 순으로 받는다.
            var res = await getJson(API + "?filter=cited_by:" + id + "&sort=cited_by_count:desc&per-page=10"
              + "&select=id,doi,display_name,publication_year,cited_by_count,primary_location,open_access");
            items = topCited(res && res.results, 3).map(summarize);
            cacheSet(key, items);
          }
        }
        if (!items) state = { msg: "OpenAlex에 이 논문이 없어요." };
        else if (!items.length) state = { msg: "참고문헌 정보가 없어요." };
        else state = { items: items };
      }
    } catch (e) {
      state = { msg: "정보를 가져오지 못했어요. 잠시 뒤 다시 눌러 주세요." };
    }
    if (my === priorToken) renderPrior(box, state);
  }

  // ---------- 2. DOI·arXiv로 바로 열기 ----------
  function setOpenMsg(text, link) {
    var el = $("rd-oa-msg");
    el.textContent = text;
    if (link) {
      el.appendChild(document.createTextNode(" "));
      var a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "새 탭에서 열기";
      el.appendChild(a);
    }
    el.hidden = !text;
  }

  async function openFromInput() {
    var input = $("rd-oa-input"), btn = $("rd-oa-go");
    var q = parseOaInput(input.value);
    if (!q) { setOpenMsg("DOI나 arXiv 번호를 확인해 주세요. 예: 10.1038/nature14539, 1706.03762"); return; }
    btn.disabled = true;
    setOpenMsg("찾는 중…");
    var pdf = null, page = null, name;
    try {
      if (q.type === "arxiv") {
        pdf = "https://arxiv.org/pdf/" + q.id;
        page = "https://arxiv.org/abs/" + q.id;
        name = "arXiv-" + q.id + ".pdf";
      } else {
        var w = await getJson(API + "/doi:" + encodeURIComponent(q.doi) + "?select=id,best_oa_location,open_access,locations");
        if (!w) { setOpenMsg("OpenAlex에서 이 DOI를 찾지 못했어요."); return; }
        var o = oaPdfOf(w);
        pdf = o.pdf; page = o.page;
        name = q.doi.replace(/[^\w.-]+/g, "_") + ".pdf";
        if (!pdf) {
          setOpenMsg(page ? "PDF 주소를 찾지 못했어요. 공개 사본 쪽에서 받아 주세요." : "오픈 액세스 논문만 열 수 있어요.", page);
          return;
        }
      }
      var blob;
      try {
        var res = await fetch(pdf, { credentials: "omit" });
        if (!res.ok) throw new Error("http " + res.status);
        blob = await res.blob();
      } catch (e) {
        // 대개 CORS: 상대 서버가 다른 사이트에서 파일을 읽는 것을 막아 둔 경우
        setOpenMsg("PDF 서버가 이 사이트에서 직접 여는 것을 막아 두었어요. 내려받은 뒤 위에서 파일을 선택해 주세요.", pdf);
        return;
      }
      setOpenMsg("");
      await root.ReaderApp.openFile(new File([blob], name, { type: "application/pdf" }));
    } catch (e) {
      setOpenMsg("정보를 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 3. AI로 넘기기 ----------
  // 쪽 글은 미리 받아 둔다: 클릭 안에서 동기로 복사·새 탭을 해야 팝업 차단을 피한다.
  var pageText = "";
  function loadPageText(n) {
    pageText = "";
    root.ReaderDoc.getTextContent(n).then(function (tc) {
      if (root.ReaderDoc.currentPage() === n) pageText = tc.items.map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim();
    }).catch(function () { /* 글 없는 쪽 */ });
  }

  function sendToAi(which) {
    var sel = root.ReaderSelection && root.ReaderSelection.current && root.ReaderSelection.current();
    var text = (sel && sel.text) || String(root.getSelection ? root.getSelection() : "").trim() || pageText;
    var D = root.ReaderDoc;
    if (!text) { D.notify("복사할 글이 없어요."); setTimeout(function () { D.unnotify("복사할 글이 없어요."); }, 3000); return; }
    var payload = PROMPT + "\n\n\"\"\"\n" + text.slice(0, 8000) + "\n\"\"\"";
    var done = "복사했어요. 새 탭에 붙여넣어 주세요.";
    var fail = "복사하지 못했어요. 글을 직접 복사해 주세요.";
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(payload) : Promise.reject();
    p.then(function () { D.notify(done); setTimeout(function () { D.unnotify(done); }, 4000); },
      function () { D.notify(fail); setTimeout(function () { D.unnotify(fail); }, 4000); });
    root.open(AI_URLS[which], "_blank", "noopener");
  }

  function init() {
    if (!$("rd-oa-input")) return;
    $("rd-oa-form").addEventListener("submit", function (e) { e.preventDefault(); openFromInput(); });
    $("rd-prior-btn").addEventListener("click", showPrior);
    $("rd-ai-chatgpt").addEventListener("click", function () { sendToAi("chatgpt"); });
    $("rd-ai-claude").addEventListener("click", function () { sendToAi("claude"); });
    var reader = $("reader");
    reader.addEventListener("reader:docopen", function () { priorToken++; $("rd-prior").hidden = true; loadPageText(1); });
    reader.addEventListener("reader:pagechange", function (e) { loadPageText(e.detail.page); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
