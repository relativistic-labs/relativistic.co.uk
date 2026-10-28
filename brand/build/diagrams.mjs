// Generates brand/diagrams/components/: one small unlabelled SVG per diagram class, for keys,
// legends and anywhere a diagram is drawn by hand. No dependencies.
//   node brand/build/diagrams.mjs
//
// Diagrams themselves are written in D2: see brand/diagrams/d2/. Its render.sh also writes
// brand/diagrams/kit-{paper,ink}.svg and example-{paper,ink}.svg, so this script no longer does.
// These components draw the same vocabulary as brand/diagrams/d2/brand.d2:
//   frame     an organisation or account boundary: 1 px rule, square corners
//   agent     a solid box in text colour
//   person    head and shoulders
//   resource  a box on the page colour
//   service   a box on the raised colour
//   store     a cylinder
//   external  a dashed box in muted
//   note      a dog-eared page in muted
//   flow      a muted 1 px arrow
//   grant     an accent 1.5 px arrow
//   deny      a dashed signal 1.5 px line ending in a cross
// No cone: the light cone is a motif for the field and the social card, never a diagram shape.
//
// Colours are CSS custom properties with paper fallbacks, so a component adapts to the theme
// when inlined into a page that loads brand/tokens.css.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(BRAND, 'diagrams', 'components');
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.svg')) rmSync(join(OUT, f));

const P = { bg: '#f9f6f2', raised: '#efece7', text: '#151a21', muted: '#555b64', accent: '#2858cd', signal: '#bb4717' };
const v = (name) => `var(--color-${name}, ${P[name]})`;
const style = `<style>
.line{fill:none;stroke:${v('text')};stroke-width:1}
.box{fill:${v('bg')};stroke:${v('text')};stroke-width:1}
.raised{fill:${v('raised')};stroke:${v('text')};stroke-width:1}
.solid{fill:${v('text')};stroke:${v('text')};stroke-width:1}
.ext{fill:none;stroke:${v('muted')};stroke-width:1;stroke-dasharray:4 4}
.note{fill:${v('bg')};stroke:${v('muted')};stroke-width:1}
.flow{fill:none;stroke:${v('muted')};stroke-width:1}
.flow-head{fill:${v('muted')}}
.grant{fill:none;stroke:${v('accent')};stroke-width:1.5}
.grant-head{fill:${v('accent')}}
.deny{fill:none;stroke:${v('signal')};stroke-width:1.5;stroke-dasharray:4 3}
.deny-x{fill:none;stroke:${v('signal')};stroke-width:1.5}
</style>`;

function comp(name, w, h, body, title) {
  writeFileSync(join(OUT, `${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">${style}${body}</svg>\n`);
}
// Edges run left to right across a 96 x 16 box.
const arrow = (cls) => `<path class="${cls}" d="M2 8.5H84"/><path class="${cls}-head" d="M84 3.5L94 8.5L84 13.5Z"/>`;

comp('frame', 96, 64, '<rect class="line" x="0.5" y="0.5" width="95" height="63"/>', 'Frame: an organisation or account');
comp('agent', 48, 32, '<rect class="solid" x="0.5" y="0.5" width="47" height="31"/>', 'Agent');
comp('person', 24, 28, `<circle class="raised" cx="12" cy="8" r="6.5"/><path class="raised" d="M1.5 27.5V24C1.5 19 6 15.5 12 15.5S22.5 19 22.5 24V27.5Z"/>`, 'Person');
comp('resource', 48, 32, '<rect class="box" x="0.5" y="0.5" width="47" height="31"/>', 'Resource');
comp('service', 48, 32, '<rect class="raised" x="0.5" y="0.5" width="47" height="31"/>', 'Service');
comp('store', 40, 40, `<path class="raised" d="M0.5 7.5V32.5C0.5 36.4 9.2 39.5 20 39.5S39.5 36.4 39.5 32.5V7.5"/><ellipse class="raised" cx="20" cy="7.5" rx="19.5" ry="7"/>`, 'Store');
comp('external', 48, 32, '<rect class="ext" x="0.5" y="0.5" width="47" height="31"/>', 'External: outside the boundary');
comp('note', 32, 40, '<path class="note" d="M0.5 0.5H23.5L31.5 8.5V39.5H0.5Z"/><path class="note" d="M23.5 0.5V8.5H31.5"/>', 'Note');
comp('flow', 96, 16, arrow('flow'), 'Flow');
comp('grant', 96, 16, arrow('grant'), 'Grant: access given explicitly');
comp('deny', 96, 16, '<path class="deny" d="M2 8.5H84"/><path class="deny-x" d="M84 3.5L94 13.5M94 3.5L84 13.5"/>', 'Deny: access refused, it stops');
console.log('wrote', readdirSync(OUT).length, 'components');
