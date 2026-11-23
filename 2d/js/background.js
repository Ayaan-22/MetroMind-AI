export function startBackground() {
  const c = document.getElementById("bgCanvas");
  const ctx = c.getContext("2d");
  let searchActive = false,
    searchIntensity = 0;
  window._setBgSearchActive = (v) => {
    searchActive = v;
  };
  function resize() {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);
  const nodes = [];
  for (let i = 0; i < 50; i++)
    nodes.push({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 1,
      baseSpeed: (Math.random() + 0.2) * 0.3,
    });
  function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    const isDark =
      document.documentElement.getAttribute("data-theme") !== "light";
    const col = isDark ? "0,229,160" : "0,140,100";
    // Ease intensity
    const target = searchActive ? 1 : 0;
    searchIntensity += (target - searchIntensity) * 0.04;
    const speedMul = 1 + searchIntensity * 5;
    const linkDist = 180 + searchIntensity * 80;
    nodes.forEach((n) => {
      n.x += n.vx * speedMul;
      n.y += n.vy * speedMul;
      if (n.x < 0 || n.x > c.width) n.vx *= -1;
      if (n.y < 0 || n.y > c.height) n.vy *= -1;
    });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x,
          dy = nodes[i].y - nodes[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < linkDist) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          const alpha =
            (1 - d / linkDist) * (0.15 + searchIntensity * 0.25);
          ctx.strokeStyle = `rgba(${col},${alpha})`;
          ctx.lineWidth = 0.5 + searchIntensity * 0.8;
          ctx.stroke();
        }
      }
      const glow = searchIntensity * 0.4;
      ctx.beginPath();
      ctx.arc(
        nodes[i].x,
        nodes[i].y,
        nodes[i].r * (1 + glow),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(${col},${0.3 + glow})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
}
