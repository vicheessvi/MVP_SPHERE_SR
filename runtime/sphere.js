(function (root) {
  "use strict";

  // Adapted from the user's local SmartRoom presentation: a rotating geodesic shell
  // encloses extruded SR letters. The compact version stays local and has no assets.
  const motion = root.matchMedia?.("(prefers-reduced-motion: reduce)");
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
  ].map((point) => point.map((value) => value / Math.hypot(...point)));
  const baseFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  const edges = new Map();
  function midpoint(a, b) {
    const key = [a, b].sort((left, right) => left - right).join(",");
    if (edges.has(key)) return edges.get(key);
    const point = vertices[a].map((value, index) => (value + vertices[b][index]) / 2);
    const length = Math.hypot(...point);
    const id = vertices.push(point.map((value) => value / length)) - 1;
    edges.set(key, id);
    return id;
  }
  const faces = baseFaces.flatMap(([a, b, c]) => {
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
  });

  let canvas = null;
  let frame = null;
  let lastFrame = 0;

  function project([x, y, z], cx, cy, radius, yaw, pitch) {
    const xx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const yy = y * Math.cos(pitch) - zz * Math.sin(pitch);
    const depth = y * Math.sin(pitch) + zz * Math.cos(pitch);
    const scale = 3.8 / (3.8 - depth);
    return [cx + xx * radius * scale, cy + yy * radius * scale, depth];
  }

  function paint(now) {
    if (!canvas?.isConnected) { frame = null; return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.clientWidth || 116, height = canvas.clientHeight || 116;
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const t = now / 1000;
    const cx = width / 2, cy = height * 0.43, radius = Math.min(width * 0.36, height * 0.37);
    const yaw = t * 0.14, pitch = -0.32 + Math.sin(t * 0.23) * 0.09;
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius * 1.5);
    halo.addColorStop(0, "rgba(91, 122, 168, .24)");
    halo.addColorStop(1, "rgba(91, 122, 168, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    const body = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
    body.addColorStop(0, "rgba(144, 225, 220, .55)");
    body.addColorStop(0.52, "rgba(67, 91, 130, .38)");
    body.addColorStop(1, "rgba(112, 97, 175, .28)");
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();

    const points = vertices.map((point) => project(point, cx, cy, radius, yaw, pitch));
    const ordered = faces.map((ids, index) => ({ ids, index, depth: ids.reduce((sum, id) => sum + points[id][2], 0) / 3 }))
      .sort((left, right) => left.depth - right.depth);
    function shell(front) {
      for (const face of ordered) {
        if ((face.depth >= 0) !== front) continue;
        const p = face.ids.map((id) => points[id]);
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.closePath();
        ctx.fillStyle = front ? "rgba(156, 209, 225, .045)" : "rgba(120, 140, 210, .02)";
        ctx.strokeStyle = front ? "rgba(109, 171, 191, .27)" : "rgba(102, 128, 179, .11)";
        ctx.lineWidth = 0.7;
        ctx.fill(); ctx.stroke();
      }
    }
    shell(false);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(radius * 0.81)}px "Segoe UI Variable", "Segoe UI", sans-serif`;
    for (let layer = 9; layer > 0; layer--) {
      ctx.fillStyle = `rgba(40, 69, 103, ${0.08 + layer * 0.008})`;
      ctx.fillText("SR", cx - layer * 0.32, cy - 4 + layer * 0.2);
    }
    const metal = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    metal.addColorStop(0, "#386b7e"); metal.addColorStop(0.32, "#f3fcfd");
    metal.addColorStop(0.58, "#96d6d2"); metal.addColorStop(1, "#776aa4");
    ctx.fillStyle = metal; ctx.shadowColor = "rgba(128, 206, 216, .55)"; ctx.shadowBlur = 9;
    ctx.fillText("SR", cx, cy - 4); ctx.shadowBlur = 0;
    shell(true);

    ctx.font = `700 ${Math.max(8, Math.round(radius * 0.22))}px "Segoe UI", sans-serif`;
    ctx.letterSpacing = "0.21em";
    ctx.fillStyle = "#315f70";
    ctx.fillText("SPHERE", cx + 2, cy + radius * 0.63);
    ctx.letterSpacing = "0px";
  }

  function tick(now) {
    if (!canvas?.isConnected || root.document.hidden || motion?.matches) { frame = null; return; }
    if (now - lastFrame >= 33) { paint(now); lastFrame = now; }
    frame = root.requestAnimationFrame(tick);
  }

  function mount(container) {
    if (frame !== null) root.cancelAnimationFrame(frame);
    frame = null;
    canvas = null;
    const header = container.querySelector("#main-content .page-header");
    if (!header) return;
    const mark = root.document.createElement("div");
    mark.className = "module-sphere";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "Сфера SR SPHERE");
    canvas = root.document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    mark.append(canvas);
    header.append(mark);
    paint(root.performance.now());
    if (!motion?.matches && !root.document.hidden) frame = root.requestAnimationFrame(tick);
  }

  root.document?.addEventListener("visibilitychange", () => {
    if (!root.document.hidden && canvas?.isConnected && frame === null && !motion?.matches) frame = root.requestAnimationFrame(tick);
  });
  motion?.addEventListener?.("change", () => {
    if (frame !== null) root.cancelAnimationFrame(frame);
    frame = null;
    if (canvas?.isConnected) {
      paint(root.performance.now());
      if (!motion.matches && !root.document.hidden) frame = root.requestAnimationFrame(tick);
    }
  });

  const api = Object.freeze({ mount });
  root.MVP_SPHERE_BRAND = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
