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
  const MAX_NODES = 20;
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

  const size = 480;
  const radius = size / 2 - 60;
  const cx = size / 2;
  const cy = size / 2;
  const positioned = circularLayout(nodes, radius, cx, cy);
  const posMap = new Map(positioned.map((n) => [n.slug, n]));

  const edgeSvg = edges
    .map(([a, b]) => {
      const pa = posMap.get(a);
      const pb = posMap.get(b);
      if (!pa || !pb) return "";
      return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" class="minimap-edge" />`;
    })
    .join("");

  const nodeSvg = positioned
    .map(
      (n) => `<a href="terms/${encodeURIComponent(n.slug)}.html" class="minimap-node-link">
        <circle cx="${n.x}" cy="${n.y}" r="6" class="minimap-node" />
        <text x="${n.x}" y="${n.y - 10}" class="minimap-label" text-anchor="middle">${escapeXml(n.title)}</text>
      </a>`
    )
    .join("");

  const note =
    truncated > 0
      ? `<p class="minimap-note">연결이 많은 상위 ${MAX_NODES}개만 표시 (${truncated}개 더 있음)</p>`
      : "";

  container.innerHTML = `${note}<svg viewBox="0 0 ${size} ${size}" class="minimap-svg" role="img" aria-label="${escapeXml(subcatKey)} 관련 용어 미니맵">${edgeSvg}${nodeSvg}</svg>`;
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
