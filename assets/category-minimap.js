function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadMinimapData() {
  const res = await fetch("assets/minimap-data.json");
  return res.json();
}

function circularLayout(nodes, radius, cx, cy) {
  const n = nodes.length;
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function degreeCount(nodes, edges) {
  const deg = new Map(nodes.map((n) => [n.slug, 0]));
  edges.forEach(([a, b]) => {
    deg.set(a, (deg.get(a) || 0) + 1);
    deg.set(b, (deg.get(b) || 0) + 1);
  });
  return deg;
}

function renderGraph(container, subcatKey, data) {
  const MAX_NODES = 14;
  let { nodes, edges } = data;
  let truncated = 0;

  if (nodes.length > MAX_NODES) {
    const deg = degreeCount(nodes, edges);
    const sorted = [...nodes].sort((a, b) => (deg.get(b.slug) || 0) - (deg.get(a.slug) || 0));
    const kept = new Set(sorted.slice(0, MAX_NODES).map((n) => n.slug));
    truncated = nodes.length - MAX_NODES;
    nodes = nodes.filter((n) => kept.has(n.slug));
    edges = edges.filter(([a, b]) => kept.has(a) && kept.has(b));
  }

  const size = 640;
  const radius = size / 2 - 130;
  const cx = size / 2;
  const cy = size / 2;
  const positioned = circularLayout(nodes, radius, cx, cy);
  const posMap = new Map(positioned.map((n) => [n.slug, n]));

  const adjacency = new Map(nodes.map((n) => [n.slug, new Set()]));
  edges.forEach(([a, b]) => {
    if (adjacency.has(a)) adjacency.get(a).add(b);
    if (adjacency.has(b)) adjacency.get(b).add(a);
  });

  const edgeSvg = edges
    .map(([a, b], i) => {
      const pa = posMap.get(a);
      const pb = posMap.get(b);
      if (!pa || !pb) return "";
      return `<line data-idx="${i}" data-a="${a}" data-b="${b}" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" class="minimap-edge" />`;
    })
    .join("");

  // Label offset alternates above/below so text doesn't collide with the ring of edges.
  const nodeSvg = positioned
    .map((n, i) => {
      const above = n.y <= cy;
      const labelY = above ? n.y - 14 : n.y + 22;
      return `<g class="minimap-node-group" data-slug="${n.slug}">
        <a href="terms/${encodeURIComponent(n.slug)}.html" class="minimap-node-link">
          <circle cx="${n.x}" cy="${n.y}" r="7" class="minimap-node" />
          <text x="${n.x}" y="${labelY}" class="minimap-label" text-anchor="middle" paint-order="stroke" stroke-width="3">${escapeXml(n.title)}</text>
        </a>
      </g>`;
    })
    .join("");

  const note =
    truncated > 0
      ? `<p class="minimap-note">연결이 많은 상위 ${MAX_NODES}개만 표시 (${truncated}개 더 있음) · 용어에 마우스를 올리면 연결선이 강조됩니다</p>`
      : `<p class="minimap-note">용어에 마우스를 올리면 연결선이 강조됩니다</p>`;

  container.innerHTML = `${note}<svg viewBox="0 0 ${size} ${size}" class="minimap-svg" role="img" aria-label="${escapeXml(subcatKey)} 관련 용어 미니맵">${edgeSvg}${nodeSvg}</svg>`;

  const svg = container.querySelector("svg");

  function setHighlight(slug) {
    const related = slug ? adjacency.get(slug) || new Set() : null;
    svg.querySelectorAll(".minimap-node-group").forEach((g) => {
      const s = g.dataset.slug;
      const active = !slug || s === slug || related.has(s);
      g.classList.toggle("is-dim", !active);
      g.classList.toggle("is-focus", slug === s);
    });
    svg.querySelectorAll(".minimap-edge").forEach((line) => {
      const active = !slug || line.dataset.a === slug || line.dataset.b === slug;
      line.classList.toggle("is-dim", !active);
      line.classList.toggle("is-focus", active && !!slug);
    });
  }

  svg.querySelectorAll(".minimap-node-group").forEach((g) => {
    g.addEventListener("mouseenter", () => setHighlight(g.dataset.slug));
    g.addEventListener("mouseleave", () => setHighlight(null));
    g.addEventListener("focusin", () => setHighlight(g.dataset.slug));
    g.addEventListener("focusout", () => setHighlight(null));
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const subcatsEl = document.getElementById("minimap-subcats");
  const graphEl = document.getElementById("minimap-graph-container");
  if (!subcatsEl || !graphEl) return;

  const data = await loadMinimapData();
  const keys = Object.keys(data).filter((k) => data[k].nodes.length >= 2);

  subcatsEl.innerHTML = keys
    .map(
      (k) =>
        `<button type="button" class="minimap-subcat-chip" data-subcat="${escapeXml(k)}">${escapeXml(k)} (${data[k].nodes.length})</button>`
    )
    .join("");

  subcatsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".minimap-subcat-chip");
    if (!chip) return;
    const key = chip.dataset.subcat;
    const isOpen = chip.classList.contains("is-active");
    subcatsEl.querySelectorAll(".minimap-subcat-chip").forEach((c) => c.classList.remove("is-active"));
    if (isOpen) {
      graphEl.innerHTML = "";
      return;
    }
    chip.classList.add("is-active");
    renderGraph(graphEl, key, data[key]);
  });
});
