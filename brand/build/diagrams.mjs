// Generates the diagram kit: brand/diagrams/kit-{paper,ink}.svg, example-{paper,ink}.svg
// and one SVG per component in brand/diagrams/components/. No dependencies.
//   node brand/build/diagrams.mjs
//
// Grammar (design brief, "Diagram style"):
//   - 1 px strokes in text or muted; 1.5 px in accent for the one path that matters
//   - geometry on the 45-degree grid: verticals, horizontals, 45-degree diagonals
//   - labels in Commit Mono, sentence case
//   - frame (organisation), cone (agent's reach), node (resource), grant (arrow with a
//     key notch), denial (stopped line ending in a bar, in signal), viewer (access checks)
//   - every diagram must work in greyscale: grant and denial differ in shape, not just colour
//
// Colours are CSS custom properties with fallbacks, so the same SVG adapts when inlined
// into a page that loads brand/tokens.css, and uses its theme's fixed values as an <img>.
// Labels are live text (editable). The Commit Mono subset is embedded as a data URI so the
// labels render in the brand mono even when the SVG is used as an image.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(BRAND, 'diagrams');
mkdirSync(join(OUT, 'components'), { recursive: true });

const THEMES = {
  paper: { bg: '#f9f6f2', raised: '#efece7', rule: '#d4d1ca', text: '#151a21', muted: '#555b64', accent: '#2858cd', signal: '#bb4717' },
  ink: { bg: '#0b0f14', raised: '#13181e', rule: '#2b3138', text: '#f2f0ec', muted: '#a5abb4', accent: '#42a3fd', signal: '#f28c5c' },
};
const mono = readFileSync(join(BRAND, 'fonts/commit-mono-400.woff2')).toString('base64');

function style(t, { embedFont = true } = {}) {
  const v = (name) => `var(--color-${name}, ${t[name]})`;
  return `<style>${embedFont ? `@font-face{font-family:"Commit Mono";src:url(data:font/woff2;base64,${mono}) format("woff2")}` : ''}
.bg{fill:${v('bg')}}
.line{fill:none;stroke:${v('text')};stroke-width:1}
.faint{fill:none;stroke:${v('muted')};stroke-width:1}
.dots{fill:none;stroke:${v('muted')};stroke-width:1;stroke-dasharray:1 4;stroke-linecap:round}
.grant{fill:none;stroke:${v('accent')};stroke-width:1.5;stroke-linejoin:miter}
.deny{fill:none;stroke:${v('signal')};stroke-width:1.5}
.node{fill:${v('bg')};stroke:${v('text')};stroke-width:1}
.agent{fill:${v('text')}}
.person{fill:${v('text')}}
.tick{fill:none;stroke:${v('rule')};stroke-width:1}
text{font-family:"Commit Mono",ui-monospace,Menlo,Consolas,monospace;font-size:15px;fill:${v('text')}}
text.m{fill:${v('muted')}}
text.a{fill:${v('accent')}}
text.s{fill:${v('signal')}}
</style>`;
}

// ---------------------------------------------------------------------------
// Components. Each returns SVG markup positioned at the given coordinates.
// Coordinates sit on half-pixels where a 1 px stroke must be crisp.
// ---------------------------------------------------------------------------

// Frame: an organisation's boundary, with its label sitting on the top edge.
function frame(x, y, w, h, label, bgClass = 'bg') {
  const lw = label.length * 9 + 12;
  return `<g><rect class="line" x="${x + 0.5}" y="${y + 0.5}" width="${w}" height="${h}"/>` +
    (label ? `<rect class="${bgClass}" x="${x + 16}" y="${y - 8}" width="${lw}" height="16"/><text x="${x + 22}" y="${y + 5}">${label}</text>` : '') + '</g>';
}
// Cone: an agent's reach. Two 45-degree lines opening upward from the apex.
function cone(ax, ay, height) {
  return `<path class="faint" d="M${ax - height} ${ay - height}L${ax} ${ay}L${ax + height} ${ay - height}"/>`;
}
// Agent: the event at the cone's apex, a small 45-degree square.
function agent(x, y) {
  return `<path class="agent" d="M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z"/>`;
}
// Node: a resource. A 12 px square.
function node(cx, cy) {
  return `<rect class="node" x="${cx - 5.5}" y="${cy - 5.5}" width="11" height="11"/>`;
}
// Grant: an arrow with a key notch near its tail. Points are a polyline on the 45-degree grid.
// The notch is a small square tooth on the left of the first segment (like the bit of a key);
// the head is an open 45-degree chevron.
function grant(points) {
  const [p0, p1] = points;
  const last = points[points.length - 1], prev = points[points.length - 2];
  const d = 'M' + points.map((p) => p.join(' ')).join('L');
  // unit vectors along the first and last segments
  const u = norm([p1[0] - p0[0], p1[1] - p0[1]]);
  const n = [u[1], -u[0]]; // left normal (screen coordinates)
  const a = [p0[0] + u[0] * 10, p0[1] + u[1] * 10];
  const tooth = 5, width = 6;
  const notch = `M${f(a[0])} ${f(a[1])}l${f(n[0] * tooth)} ${f(n[1] * tooth)}l${f(u[0] * width)} ${f(u[1] * width)}l${f(-n[0] * tooth)} ${f(-n[1] * tooth)}`;
  const v = norm([last[0] - prev[0], last[1] - prev[1]]);
  const head = 7;
  const back = [-v[0], -v[1]];
  const r = rot(back, Math.PI / 4), l = rot(back, -Math.PI / 4);
  const arrow = `M${f(last[0] + r[0] * head)} ${f(last[1] + r[1] * head)}L${last[0]} ${last[1]}L${f(last[0] + l[0] * head)} ${f(last[1] + l[1] * head)}`;
  return `<path class="grant" d="${d}"/><path class="grant" d="${notch}"/><path class="grant" d="${arrow}"/>`;
}
// Denial: a stopped line ending in a bar, in signal.
function denial(x1, y, x2) {
  return `<path class="deny" d="M${x1} ${y + 0.5}H${x2}"/><path class="deny" d="M${x2} ${y - 7.5}V${y + 8.5}"/>`;
}
// Viewer: a small person, head and 45-degree shoulders. Used only to show access checks.
function viewer(cx, cy) {
  return `<g><circle class="person" cx="${cx}" cy="${cy - 9}" r="4.5"/><path class="person" d="M${cx - 9} ${cy + 7}L${cx - 2} ${cy}H${cx + 2}L${cx + 9} ${cy + 7}Z"/></g>`;
}
function norm(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
function rot(v, a) { return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; }
function f(n) { return Math.round(n * 100) / 100; }

function doc(w, h, t, body, title, desc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t d"><title id="t">${title}</title><desc id="d">${desc}</desc>${style(t)}<rect class="bg" width="${w}" height="${h}"/>${body}</svg>\n`;
}

// ---------------------------------------------------------------------------
// Kit sheet: every component with its name and rule.
// ---------------------------------------------------------------------------
function kit(t) {
  const cells = [
    ['Frame', 'an organisation', (x) => frame(x + 20, 64, 140, 92, 'acme')],
    ['Cone', "an agent's reach", (x) => cone(x + 90, 150, 64) + agent(x + 90, 150)],
    ['Node', 'a resource', (x) => node(x + 70, 110) + `<text x="${x + 84}" y="114.5">crm</text>`],
    ['Grant', 'arrow, key notch', (x) => grant([[x + 30, 150], [x + 30, 120], [x + 90, 60]])],
    ['Denial', 'ends in a bar', (x) => denial(x + 24, 110, x + 112) + `<path class="dots" d="M${x + 118} 110.5H${x + 158}"/>`],
    ['Viewer', 'access checks', (x) => viewer(x + 90, 110)],
  ];
  let body = '';
  cells.forEach(([name, rule, draw], i) => {
    const x = i * 200;
    body += draw(x);
    body += `<path class="tick" d="M${x + 20} 190.5H${x + 160}"/>`;
    body += `<text x="${x + 20}" y="214">${name.toLowerCase()}</text><text class="m" x="${x + 20}" y="234">${rule}</text>`;
  });
  return doc(1200, 260, t, body, 'Relativistic diagram kit', 'Six components: frame, cone, node, grant, denial and viewer.');
}

// ---------------------------------------------------------------------------
// Worked example: an agent's cone inside an organisation's frame, one grant, one denial.
// ---------------------------------------------------------------------------
function example(t) {
  const W = 880, H = 560;
  const ax = 440, ay = 440;            // the agent's apex
  let b = '';
  // Organisation frame with drawing-style ticks along the bottom and left edges.
  b += frame(40, 48, 800, 432, 'organisation: acme');
  for (let x = 80; x < 840; x += 40) b += `<path class="tick" d="M${x + 0.5} 481V487"/>`;
  for (let y = 88; y < 480; y += 40) b += `<path class="tick" d="M34 ${y + 0.5}H40"/>`;
  // The cone and the agent's timeline (a vertical: the agent stays where it is, time runs up).
  b += cone(ax, ay, 280);
  b += `<path class="faint" d="M${ax + 0.5} ${ay - 6}V160" stroke-dasharray="2 4"/>`;
  b += `<text class="m" x="${ax - 280}" y="148">what it was granted</text>`;
  // Resources inside the cone.
  b += node(360, 330) + `<text x="340" y="313">crm: read</text>`;
  b += node(330, 240) + `<text x="344" y="244.5">calendar</text>`;
  b += node(500, 190) + `<text x="514" y="194.5">docs: project-x</text>`;
  // The grant: from an event on the agent's timeline, 45 degrees up to the CRM.
  b += grant([[ax, 410], [366, 336]]);
  b += `<text class="a" x="${ax + 12}" y="360">granted</text>`;
  // The denial: reaching for payroll, stopped at the edge of the cone.
  const dy = 300, edge = ax + (ay - dy);   // the cone's right edge at this height
  b += denial(ax + 1, dy, edge);
  b += `<path class="dots" d="M${edge + 8} ${dy + 0.5}H${694}"/>`;
  b += node(700, dy) + `<text x="676" y="${dy - 14}">payroll</text>`;
  b += `<text class="s" x="${ax + 12}" y="${dy - 10}">denied</text>`;
  b += `<text class="m" x="664" y="${dy + 26}">not granted</text>`;
  // The agent at the apex.
  b += agent(ax, ay) + `<text x="${ax + 14}" y="${ay + 4.5}">agent</text>`;
  // Legend, outside the frame.
  const ly = 528;
  b += grant([[56, ly], [96, ly]]) + `<text class="m" x="108" y="${ly + 4.5}">grant</text>`;
  b += denial(180, ly, 214) + `<text class="m" x="226" y="${ly + 4.5}">denial</text>`;
  b += node(310, ly) + `<text class="m" x="324" y="${ly + 4.5}">resource</text>`;
  b += agent(420, ly) + `<text class="m" x="434" y="${ly + 4.5}">agent</text>`;
  b += `<path class="faint" d="M508 ${ly - 6}L520 ${ly + 6}L532 ${ly - 6}"/><text class="m" x="544" y="${ly + 4.5}">reach</text>`;
  return doc(W, H, t, b, "An agent's reach inside an organisation",
    'An agent at the apex of a cone inside an organisation frame. Resources inside the cone (crm, calendar, docs) are reachable; the agent has a grant to read the CRM. Payroll lies outside the cone: the agent reaches for it and is stopped at the edge of the cone.');
}

for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(join(OUT, `kit-${name}.svg`), kit(t));
  writeFileSync(join(OUT, `example-${name}.svg`), example(t));
}

// Individual components (paper fallbacks, token-aware when inlined; no text, so no font).
const P = THEMES.paper;
const comp = (name, w, h, body, title) => writeFileSync(join(OUT, 'components', `${name}.svg`),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">${style(P, { embedFont: false })}${body}</svg>\n`);
comp('frame', 160, 112, frame(8, 16, 144, 88, '', 'bg'), 'Frame: an organisation');
comp('cone', 144, 80, cone(72, 72, 64) + agent(72, 72), "Cone: an agent's reach");
comp('node', 16, 16, node(8, 8), 'Node: a resource');
comp('grant', 96, 96, grant([[16, 88], [16, 64], [72, 8]]), 'Grant');
comp('denial', 112, 24, denial(4, 12, 104), 'Denial');
comp('viewer', 24, 28, viewer(12, 18), 'Viewer');
comp('agent', 16, 16, agent(8, 8), 'Agent');
console.log('wrote diagram kit');
