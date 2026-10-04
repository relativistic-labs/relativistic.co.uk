(() => {
  'use strict';
  const canvas = document.querySelector('#field');
  const ctx = canvas.getContext('2d');
  const button = document.querySelector('#motion');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const names = ['EMERGENT / SPHERE', 'CONNECTED / ORBIT', 'POSSIBILITY / WAVE', 'IDEAS / UNBOUND'];
  let width, height, scale, time = 0, last = 0, paused = reduced.matches;
  const pointer = {x: -1000, y: -1000};
  const particles = Array.from({length: 2200}, (_, i) => ({
    u: (i + .5) / 2200, angle: i * 2.399963229728653,
    seed: Math.random(), size: Math.random() * 1.2 + .35,
    x: 0, y: 0
  }));
  function resize() {
    width = innerWidth; height = innerHeight; scale = Math.min(width * .29, height * .43);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function point(p, mode, t) {
    const a = p.angle, u = p.u;
    if (mode === 0) {
      const y = 1 - 2 * u, r = Math.sqrt(1 - y * y), spin = a + t * .14;
      return [r * Math.cos(spin), y, r * Math.sin(spin)];
    }
    if (mode === 1) {
      const ring = Math.floor(u * 5), theta = a + t * (.12 + ring * .025);
      const x = Math.cos(theta), z = Math.sin(theta), tilt = ring * .58;
      return [x * .95, z * Math.sin(tilt) * .85, z * Math.cos(tilt)];
    }
    if (mode === 2) {
      const x = (u * 2 - 1) * 1.3, z = Math.sin(a) * .85;
      return [x, Math.sin(x * 3 + z * 2 + t * .5) * .35 + z * .35, z];
    }
    return [Math.cos(a + t * .07) * (1 + p.seed * .8), Math.sin(a * .73 + t * .09) * 1.35, Math.sin(a + t * .1)];
  }
  function draw(stamp) {
    const dt = last ? Math.min((stamp - last) / 1000, .05) : 0; last = stamp;
    if (!paused && !document.hidden) time += dt;
    ctx.clearRect(0, 0, width, height);
    const centerX = width < 800 ? width * .78 : width * .76, centerY = height * .48;
    const phase = time / 8, mode = Math.floor(phase) % 4;
    const blend = Math.max(0, (phase % 1 - .68) / .32);
    const ease = blend * blend * (3 - 2 * blend);
    document.querySelector('#scene-number').textContent = String(mode + 1).padStart(3, '0');
    document.querySelector('#scene-name').textContent = names[mode];
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, scale * 1.8);
    glow.addColorStop(0, '#38552b22'); glow.addColorStop(1, '#080b0b00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const p of particles) {
      const from = point(p, mode, time), to = point(p, (mode + 1) % 4, time);
      let x = from[0] + (to[0] - from[0]) * ease;
      let y = from[1] + (to[1] - from[1]) * ease;
      const z = from[2] + (to[2] - from[2]) * ease;
      const perspective = 2.8 / (2.8 + z * .5);
      x = centerX + x * scale * perspective;
      y = centerY + y * scale * perspective;
      const dx = x - pointer.x, dy = y - pointer.y, distance = Math.hypot(dx, dy);
      if (distance < 130 && distance > 0 && !paused) {
        const force = (1 - distance / 130) * 30; x += dx / distance * force; y += dy / distance * force;
      }
      const opacity = (.22 + (z + 1) * .25) * (width < 800 && x < width * .6 ? .3 : 1);
      ctx.fillStyle = `rgba(${160 + Math.floor(p.seed * 40)},${210 + Math.floor(p.seed * 40)},${110 + Math.floor(p.seed * 60)},${opacity})`;
      ctx.beginPath(); ctx.arc(x, y, p.size * perspective, 0, Math.PI * 2); ctx.fill();
    }
    if (!paused) requestAnimationFrame(draw);
  }
  function updateButton() {button.setAttribute('aria-pressed', String(paused)); button.innerHTML = paused ? 'Resume motion <span>▶</span>' : 'Pause motion <span>Ⅱ</span>';}
  button.addEventListener('click', () => {paused = !paused; updateButton(); last = 0; requestAnimationFrame(draw);});
  reduced.addEventListener('change', e => {paused = e.matches; updateButton(); last = 0; requestAnimationFrame(draw);});
  addEventListener('pointermove', e => {pointer.x = e.clientX; pointer.y = e.clientY;});
  addEventListener('pointerout', () => {pointer.x = pointer.y = -1000;});
  addEventListener('resize', () => {resize(); if (paused) requestAnimationFrame(draw);});
  document.querySelector('#year').textContent = new Date().getFullYear();
  resize(); updateButton(); requestAnimationFrame(draw);
})();
