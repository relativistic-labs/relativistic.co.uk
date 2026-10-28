// Generates brand/tokens.css and brand/tokens.json from the single definition below.
// No dependencies. Run from anywhere:  node brand/build/tokens.mjs
// Edit values here, never in the generated files.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Colour: the design brief's table. [oklch, hex] per theme.
// ---------------------------------------------------------------------------
const colour = {
  bg:     { ink: ['oklch(0.165 0.012 255)', '#0b0f14'], paper: ['oklch(1 0 0)', '#ffffff'], use: 'Page background' },
  raised: { ink: ['oklch(0.205 0.014 255)', '#13181e'], paper: ['oklch(0.964 0.003 85)', '#f4f3f1'], use: 'Cards, code, the footer band' },
  rule:   { ink: ['oklch(0.31 0.016 255)', '#2b3138'],  paper: ['oklch(0.781 0.008 254)', '#b4b8bd'],  use: 'Hairlines, axes, borders. Decorative (about 1.5:1): never the only signal of anything' },
  text:   { ink: ['oklch(0.955 0.006 85)', '#f2f0ec'],  paper: ['oklch(0.215 0.016 255)', '#151a21'], use: 'Body and headings' },
  muted:  { ink: ['oklch(0.74 0.014 255)', '#a5abb4'],  paper: ['oklch(0.47 0.016 255)', '#555b64'],  use: 'Secondary text, labels' },
  accent: { ink: ['oklch(0.80 0.11 190)', '#59d4cd'],   paper: ['oklch(0.48 0.08 190)', '#0c6c68'],   use: 'Starling teal, from the sheen on a starling\'s feathers. Links, the one thing per view that matters. At most about 5% of a view' },
  signal: { ink: ['oklch(0.74 0.14 45)', '#f28c5c'],    paper: ['oklch(0.55 0.16 40)', '#bb4717'],    use: 'Redshift. Rare: denials in diagrams, about 1% of field particles. Not a second brand colour' },
};

// WCAG 2.x contrast ratios, computed from the hex values (see brand/index.html).
const contrast = [
  { fg: 'text', bg: 'bg', ink: 16.9, paper: 17.48 },
  { fg: 'text', bg: 'raised', ink: 15.71, paper: 15.76 },
  { fg: 'muted', bg: 'bg', ink: 8.36, paper: 6.85 },
  { fg: 'muted', bg: 'raised', ink: 7.77, paper: 6.18 },
  { fg: 'accent', bg: 'bg', ink: 10.73, paper: 6.25 },
  { fg: 'accent', bg: 'raised', ink: 9.96, paper: 5.64 },
  { fg: 'signal', bg: 'bg', ink: 7.97, paper: 5.22 },
  { fg: 'signal', bg: 'raised', ink: 7.4, paper: 4.7 },
  { fg: 'bg', bg: 'accent', ink: 10.73, paper: 6.25, note: 'Text on an accent fill (a primary button)' },
  { fg: 'rule', bg: 'bg', ink: 1.47, paper: 1.99, note: 'Structure only: never the only signal of anything' },
];

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------
const fonts = {
  sans: '"Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"Commit Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

// Fluid scale: ratio 1.2 at 360 px rising to 1.333 at 1440 px (brief).
// Body steps from 17 px to 18 px. Nothing below 12 px; body never below 16 px.
const vwMin = 360, vwMax = 1440;
const baseMin = 17, baseMax = 18;
const ratioMin = 1.2, ratioMax = 1.333;
function fluid(minPx, maxPx) {
  if (Math.abs(maxPx - minPx) < 0.01) return `${round(minPx / 16, 4)}rem`;
  const slope = (maxPx - minPx) / (vwMax - vwMin);
  const intercept = minPx - slope * vwMin;
  return `clamp(${round(minPx / 16, 4)}rem, ${round(intercept / 16, 4)}rem + ${round(slope * 100, 4)}vw, ${round(maxPx / 16, 4)}rem)`;
}
function round(x, n) { const k = 10 ** n; return Math.round(x * k) / k; }
const steps = {};
for (const n of [1, 2, 3, 4, 5, 6]) {
  steps[`step-${n}`] = [baseMin * ratioMin ** n, baseMax * ratioMax ** n];
}
const typeScale = {
  'label': { css: '0.75rem', min: 12, max: 12, use: 'Mono labels: uppercase, +0.06em tracking. The smallest size anywhere' },
  'small': { css: '1rem', min: 16, max: 16, use: 'Captions and footnotes (never body)' },
  'body': { css: fluid(baseMin, baseMax), min: baseMin, max: baseMax, use: 'Body text, line height 1.55' },
};
for (const [k, [a, b]] of Object.entries(steps)) {
  typeScale[k] = { css: fluid(a, b), min: round(a, 1), max: round(b, 1) };
}
typeScale['step-1'].use = 'Lead paragraph, h4';
typeScale['step-2'].use = 'h3';
typeScale['step-3'].use = 'h2 (section headings)';
typeScale['step-4'].use = 'Statements';
typeScale['step-5'].use = 'h1 in the hero';
typeScale['step-6'].use = 'Title slides and the social card only';

// ---------------------------------------------------------------------------
// Space, rules, radii, motion, layout
// ---------------------------------------------------------------------------
const space = { '1': 4, '2': 8, '3': 12, '4': 16, '5': 24, '6': 32, '7': 48, '8': 64, '9': 96, '10': 128 };

const motion = {
  'duration-fast': ['150ms', 'Hover, focus, small state changes'],
  'duration-base': ['200ms', 'Most interface transitions'],
  'duration-slow': ['250ms', 'The longest interface transition allowed'],
  'ease-out': ['cubic-bezier(0.2, 0.8, 0.2, 1)', 'All interface transitions ease out'],
  'portrait-shift': ['600ms', 'The portrait shift: plays once per card (500 to 700 ms), never loops'],
};

// ---------------------------------------------------------------------------
// tokens.css
// ---------------------------------------------------------------------------
const L = [];
L.push(`/*
 * Relativistic design tokens. GENERATED by brand/build/tokens.mjs: edit that file, not this one.
 *
 * Colours use light-dark(), so they follow the element's used color-scheme:
 *   - by default, the reader's system setting (color-scheme: light dark);
 *   - .theme-ink or [data-theme="ink"] forces ink (dark);
 *   - .theme-paper or [data-theme="paper"] forces paper (light).
 * Fixed values for each theme are also exposed as --ink-* and --paper-*.
 * Fonts are declared in brand/fonts/fonts.css (the site uses Astro's Fonts API instead).
 */

:root {
  color-scheme: light dark;
`);
L.push('  /* Colour: fixed values per theme */');
for (const theme of ['ink', 'paper']) {
  for (const [name, v] of Object.entries(colour)) L.push(`  --${theme}-${name}: ${v[theme][0]}; /* ${v[theme][1]} */`);
}
L.push('');
L.push('  /* Colour: theme-aware (use these) */');
for (const [name] of Object.entries(colour)) L.push(`  --color-${name}: light-dark(var(--paper-${name}), var(--ink-${name}));`);
L.push('');
L.push('  /* Field colours: on ink, pale particles with an accent glow; on paper, ink dots and density */');
L.push('  --field-particle: var(--color-text);');
L.push('  --field-glow: var(--color-accent);');
L.push('  --field-signal: var(--color-signal);');
L.push('');
L.push('  /* Type families */');
L.push(`  --font-sans: ${fonts.sans};`);
L.push(`  --font-mono: ${fonts.mono};`);
L.push('');
L.push('  /* Weights. Instrument Sans is variable: 400 to 700 */');
L.push('  --weight-regular: 400;');
L.push('  --weight-medium: 500;');
L.push('  --weight-semibold: 600;');
L.push('  --weight-bold: 700;');
L.push('');
L.push('  /* Width axis (wdth 75 to 100). Large headings are condensed slightly. Needs instrument-sans-wdth-wght.woff2 */');
L.push('  --stretch-text: 100%;');
L.push('  --stretch-display: 92%;');
L.push('');
L.push(`  /* Fluid type scale: ratio ${ratioMin} at ${vwMin}px rising to ${ratioMax} at ${vwMax}px */`);
for (const [k, v] of Object.entries(typeScale)) L.push(`  --text-${k}: ${v.css}; /* ${v.min}${v.min !== v.max ? '–' + v.max : ''}px */`);
L.push('');
L.push('  /* Line height and tracking */');
L.push('  --leading-tight: 1.08;   /* display headlines */');
L.push('  --leading-heading: 1.2;');
L.push('  --leading-body: 1.55;');
L.push('  --tracking-display: -0.025em;');
L.push('  --tracking-heading: -0.02em;');
L.push('  --tracking-label: 0.06em;  /* uppercase mono labels */');
L.push('  --measure: 64ch;           /* 60 to 68 characters */');
L.push('');
L.push('  /* Space: 8 px base with 4 px half-steps */');
for (const [k, v] of Object.entries(space)) L.push(`  --space-${k}: ${v / 16}rem; /* ${v}px */`);
L.push('  --space-section: clamp(4rem, 2.5rem + 6.6667vw, 8rem); /* vertical rhythm between sections */');
L.push('');
L.push('  /* Layout */');
L.push('  --page-max: 80rem;               /* 1280px */');
L.push('  --page-margin: clamp(1.25rem, 0.4167rem + 3.7037vw, 3.75rem); /* 20 to 60px */');
L.push('  --grid-columns: 12;');
L.push('  --grid-gutter: var(--space-5);');
L.push('');
L.push('  /* Rules: hairlines are structure */');
L.push('  --rule-width: 1px;');
L.push('  --rule-strong-width: 1.5px;     /* the one path that matters in a diagram */');
L.push('  --rule: var(--rule-width) solid var(--color-rule);');
L.push('');
L.push('  /* Corners: square, or nearly. Never pills */');
L.push('  --radius-0: 0;');
L.push('  --radius-1: 2px;');
L.push('');
L.push('  /* Focus and targets */');
L.push('  --focus-width: 2px;');
L.push('  --focus-offset: 3px;');
L.push('  --focus-ring: var(--focus-width) solid var(--color-accent);');
L.push('  --target-min: 44px;');
L.push('');
L.push('  /* Motion */');
for (const [k, [v, use]] of Object.entries(motion)) L.push(`  --${k}: ${v}; /* ${use} */`);
L.push('}');
L.push('');
L.push(`/* Forced themes */
.theme-ink, [data-theme="ink"] { color-scheme: dark; }
.theme-paper, [data-theme="paper"] { color-scheme: light; }

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-base: 0ms;
    --duration-slow: 0ms;
  }
}
`);
writeFileSync(join(out, 'tokens.css'), L.join('\n'));

// ---------------------------------------------------------------------------
// tokens.json
// ---------------------------------------------------------------------------
const json = {
  name: 'Relativistic',
  version: '1.0.0',
  generated: 'brand/build/tokens.mjs',
  themes: {
    ink: { scheme: 'dark', use: 'Social images, the field hero, dark-room slides' },
    paper: { scheme: 'light', use: 'Documents, proposals, print' },
  },
  color: Object.fromEntries(Object.entries(colour).map(([k, v]) => [k, {
    ink: { oklch: v.ink[0], hex: v.ink[1] },
    paper: { oklch: v.paper[0], hex: v.paper[1] },
    use: v.use,
  }])),
  contrast,
  font: {
    sans: { family: 'Instrument Sans', stack: fonts.sans, axes: { wght: [400, 700], wdth: [75, 100] }, files: ['fonts/instrument-sans-wght.woff2', 'fonts/instrument-sans-wght-italic.woff2', 'fonts/instrument-sans-wdth-wght.woff2'], licence: 'fonts/OFL-InstrumentSans.txt' },
    mono: { family: 'Commit Mono', stack: fonts.mono, weights: [400, 700], files: ['fonts/commit-mono-400.woff2', 'fonts/commit-mono-700.woff2'], licence: 'fonts/OFL-CommitMono.txt' },
  },
  type: {
    scale: { ratio: { [vwMin]: ratioMin, [vwMax]: ratioMax }, steps: typeScale },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    stretch: { text: '100%', display: '92%' },
    leading: { tight: 1.08, heading: 1.2, body: 1.55 },
    tracking: { display: '-0.025em', heading: '-0.02em', label: '0.06em' },
    measure: '64ch',
    styles: {
      display: { family: 'sans', size: 'step-5', weight: 600, stretch: '92%', leading: 1.08, tracking: '-0.025em' },
      h2: { family: 'sans', size: 'step-3', weight: 600, leading: 1.2, tracking: '-0.02em' },
      h3: { family: 'sans', size: 'step-2', weight: 600, leading: 1.2, tracking: '-0.02em' },
      body: { family: 'sans', size: 'body', weight: 400, leading: 1.55 },
      label: { family: 'mono', size: 'label', weight: 400, leading: 1.4, tracking: '0.06em', case: 'uppercase' },
      data: { family: 'mono', size: 'small', weight: 400, leading: 1.5, case: 'sentence' },
    },
  },
  space: Object.fromEntries(Object.entries(space).map(([k, v]) => [k, `${v}px`])),
  layout: { pageMax: '1280px', pageMargin: '20–60px fluid', columns: 12, gutter: '24px' },
  rule: { width: '1px', strongWidth: '1.5px' },
  radius: { '0': '0', '1': '2px' },
  focus: { width: '2px', offset: '3px', color: 'accent' },
  target: { min: '44px' },
  motion: Object.fromEntries(Object.entries(motion).map(([k, [v, use]]) => [k, { value: v, use }])),
  field: {
    kind: 'A murmuration: each bird steers by its seven nearest neighbours in 3D',
    patterns: ['padlock', 'bar chart', 'document page', 'light cone', 'sphere'],
    patternEvery: '15–25 s, held loosely for about 3 s',
    predator: 'Rarely, a small signal-coloured knot the flock parts around',
    reducedMotion: 'One still frame of the flock in a fold',
    reference: 'src/scripts/field/flock.ts',
  },
  portrait: {
    aspect: '4:5',
    default: 'The real photograph. Used for social, LinkedIn, press, no-JS, reduced motion and screen readers',
    shift: {
      duration: '600ms',
      plays: 'once per card, when 60% in view; never loops',
      geometry: 'bands on the 45-degree grid, displaced along their own diagonal',
      split: { lead: 'accent (blueshift)', trail: 'signal (redshift)' },
      labels: { before: 'RENDERED / AI', after: 'AS OBSERVED' },
      safety: 'no flicker; under 3 flashes per second; no full-frame luminance change',
      reference: 'portraits/glitch.js',
    },
  },
};
writeFileSync(join(out, 'tokens.json'), JSON.stringify(json, null, 2) + '\n');
console.log('wrote tokens.css and tokens.json');
