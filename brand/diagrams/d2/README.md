# Relativistic diagrams in D2

Write a short `.d2` file and get an on-brand diagram in paper and ink. [D2](https://d2lang.com) is a text language for diagrams; a layout engine places the shapes and routes the lines, so nobody draws coordinates by hand.

```
brand/diagrams/d2/
  brand.d2        the shared style: themes, fonts, classes. Import it, don't edit it per diagram
  render.sh       renders everything in templates/ and examples/ into out/
  templates/      one file per kind of diagram, with realistic content to copy
  examples/       the worked example and the kit sheet used by the guidelines, slides and documents
  fonts/          Instrument Sans and Commit Mono as TTF, with their licences
  lib/finish.mjs  theme, checks and PNGs, for render.sh
  out/            rendered files (generated)
```

## Write a diagram

1. Copy the template closest to what you need from `templates/` into `templates/` or `examples/` under a new name.
2. Keep the import on the first line: `...@../brand`. From anywhere else, use the absolute path in quotes, because the folder name has dots in it: `...@"/path/to/repo/brand/diagrams/d2/brand.d2"`.
3. Give every shape and every edge a class:

   ```d2
   acme: Acme workspace {
     class: frame
     agent: Agent {class: agent}
     crm: CRM {class: resource}
     payroll: Payroll {class: resource}
     agent -> crm: read {class: grant}
     agent -> payroll: not granted {class: deny}
   }
   ```

4. Run `./render.sh templates/yours.d2` (or `./render.sh` for everything) and open `out/yours-paper@2x.png`.

A diagram that lives elsewhere, such as a deck's `assets/` folder, imports `brand.d2` by its absolute path and renders into its own folder: `OUT=$PWD /path/to/repo/brand/diagrams/d2/render.sh $PWD/diagram.d2`. Give absolute paths: the script runs from its own folder. To set larger type for a slide, put globs at the top of the file: they beat the classes' sizes.

Never use `d2 --watch`. It starts a server and a file watcher, and this machine overheats with watchers. Render once, look, edit, render again.

### The classes

| Class | Draws | Use it for |
|---|---|---|
| `frame` | a 1 px box, label top left | an organisation or account boundary. A container: put shapes inside it |
| `agent` | a solid box in text colour | the agent. There is usually one |
| `person` | head and shoulders, label below | whoever the agent acts for, or whoever opens the work. Keep the label to a name |
| `resource` | a box on the page colour | what gets used: documents, a CRM, a finance system |
| `service` | a box on the raised colour | something that runs: an app, a gateway, a workspace |
| `store` | a cylinder | where data lives |
| `external` | a dashed, muted box | anything outside the boundary: the internet, SaaS, providers |
| `note` | a dog-eared page, muted | an aside of a line or two |
| `table` | `sql_table`, dark header | data models |
| `head`, `cell` | grid cells | comparisons and timelines in a grid |
| `flow` | a muted 1 px arrow | most edges |
| `grant` | an accent 1.5 px arrow, labelled | access given explicitly. Say what was granted |
| `deny` | a dashed signal 1.5 px line ending in a cross, labelled | access refused. It stops. Say why: "not granted", "no internet" |
| `emphasis` | an accent 1.5 px arrow | the one path that matters, once per diagram, in diagrams that aren't about access |

Rules the classes already follow: square corners, 1 px strokes, one accent path, no shadows, no 3D, no gradients, no sketch mode, labels in mono and sentence case. Colour is never the only signal: a grant is heavier than a flow and labelled, a denial is dashed and ends in a cross, an external system is dashed. Every diagram must make sense in greyscale.

The light cone is a motif for the field and the social card. It is never a diagram shape: use the conventional form a reader understands fastest.

### Templates

| Template | Engine | Use it for | Limit |
|---|---|---|---|
| `access` | ELK | the core diagram: one agent, its grants and denials, the internet | 1 agent, 6 resources |
| `architecture` | TALA | what runs where, in nested accounts | 10 shapes, 2 levels |
| `flow` | ELK | a process, left to right | 6 steps |
| `sequence` | (its own) | requests, checks and replies in order | 5 actors, 10 messages |
| `options` | ELK (a grid) | comparing tiers or deployment options | 4 columns, 5 rows |
| `hierarchy` | ELK | an organisation, teams and people | 3 levels, 12 shapes |
| `timeline` | ELK (a grid) | phases of a plan | 6 phases |
| `data-model` | ELK | tables and keys | 6 tables |

Each file's header says why its engine won. In short: ELK keeps things in the order written and routes cleanly with labels inline; TALA packs nested containers best; dagre curves its edges, which the brand doesn't use. Sequence diagrams and grids lay themselves out. To try another engine, run `d2 --layout=tala file.d2 /tmp/x.svg` and so on, or change `vars.d2-config.layout-engine` in the file. TALA's layout depends on a seed: try `--tala-seeds=1,2,3,4` and pin the best with `vars.d2-config.data.tala-seeds: [n]`.

Tips that keep diagrams readable:

- Fewer edges cross fewer things. If two lines cross, move one connection to a different shape, or drop it.
- Put grants before denials in the file; ELK keeps that order, so grants stack above denials.
- Labels under a person glyph can run past a frame's edge in ELK. Keep them to a name.
- Long labels break with `\n` inside quotes: `"A private app,\nonly Priya sees it"`.

## What render.sh makes

For each `.d2` file, in `out/`:

| File | What it is |
|---|---|
| `name.svg` | follows the reader's `prefers-color-scheme`: paper in light mode, ink in dark. For web pages |
| `name-paper.svg`, `name-ink.svg` | one theme, fixed. For slides, documents and print, where the theme doesn't follow the reader |
| `name-paper@2x.png`, `name-ink@2x.png` | rasters at twice the size, for anywhere that can't take SVG |
| `contact-paper.png`, `contact-ink.png` | every template on one sheet |

It also copies `out/example-*.svg` and `out/kit-*.svg` to `brand/diagrams/`, where the guidelines page, the slides and the proposal use them.

Every label is at least 12 px at 1× (the classes use 14 and 16), and every text colour meets WCAG AA on its background: see the contrast table in `brand/tokens.json`. `lib/finish.mjs` warns if a diagram has a smaller font size or a colour outside the palette.

## How it works

**Themes.** `brand.d2` sets every D2 theme colour code (`N1`–`N7`, `B1`–`B6`, `AA2`–`AB5`) in `vars.d2-config.theme-overrides` (paper) and `dark-theme-overrides` (ink), so D2's own colours follow `prefers-color-scheme` in one SVG. D2 accepts only hex values in a style, not theme codes, so the classes use the seven paper hex values from `brand/tokens.json`. `lib/finish.mjs` adds those seven values' ink equivalents to D2's dark-mode stylesheet, so the classes switch too. If you style something by hand, use only the seven palette values listed at the top of `brand.d2`.

**Fonts.** D2 needs TTF or OTF files, one per weight, passed with its font flags. `render.sh` sets them as environment variables (`D2_FONT_REGULAR`, `D2_FONT_MONO` and the rest). D2 subsets the fonts and embeds them in each SVG, so the SVGs render correctly as images with nothing installed.

- **Commit Mono** fills the mono slots (400, 700, italic), and `brand.d2` sets `style.font: mono` on every shape and edge with a global glob (`***`), so every label is Commit Mono, classed or not. Commit Mono ships in 400 and 700 only, so the semibold slot uses 700.
- **Instrument Sans** fills the regular slots (400, 600, 700, italic). It is used only where a label asks for it with `style.font: default`, for example a heading in a Markdown block.
- `sql_table` ignores `style.font` and always uses the regular face, so for files with tables `render.sh` puts Commit Mono in the regular slots too.
- Rendered without `render.sh` (in an editor preview, say), D2 falls back to its bundled fonts: Source Sans Pro for regular text and Source Code Pro for mono.

**Things D2 can't do, and the workarounds in `lib/finish.mjs`:**

- Stroke widths are whole pixels, so `brand.d2` asks for 2 px and the finish step draws accent and signal lines at 1.5 px.
- `sql_table` row rules and sequence lifelines are fixed at 2 px; the finish step draws them at 1 px.
- A glob in an imported file can't be overridden by a class (D2 lets globs win), so the globs set only the face, italic and square bends. Edge classes also set `fill`, which D2 draws behind an edge label, so a border passing under a label never runs through the text.

## Versions and licences

| | Version | Source | Licence |
|---|---|---|---|
| D2 | v0.9.0 (7 September 2026) | [github.com/d2lang/d2 releases](https://github.com/d2lang/d2/releases/tag/v0.9.0) (`terrastruct/d2` redirects there), `d2-v0.9.0-linux-amd64.tar.gz`, checked against the release's `SHA256SUMS` (`5669ddc4…dd87a9`). Installed to `~/.local/bin/d2` | MPL-2.0 |
| TALA | bundled in D2 v0.9.0 (`d2layouts/d2talalayout`) | the same binary: `d2 layout` lists `tala (bundled)` | MPL-2.0, D2's licence |
| ELK, dagre | bundled in D2 v0.9.0 | the same binary | EPL-2.0 (ELK), MIT (dagre); see D2's `THIRD_PARTY_NOTICES.txt` |
| Instrument Sans | 2022 project, from google/fonts `ofl/instrumentsans` | static instances made from the variable TTFs; see `fonts/OFL-InstrumentSans.txt` | SIL OFL 1.1 |
| Commit Mono | v1.143 | [github.com/eigilnikolajsen/commit-mono releases](https://github.com/eigilnikolajsen/commit-mono/releases/tag/v1.143), TTFs unmodified; see `fonts/OFL-CommitMono.txt` | SIL OFL 1.1 |

**TALA's licence.** TALA used to be a closed-source plugin (`d2plugin-tala`) from `terrastruct/TALA`, free to evaluate but watermarked without a paid key. That repository is now archived: its last release, v0.4.3 (August 2025), still says "TALA is closed-source" and needs a key. D2 v0.9.0 made TALA open source and bundled it: the release notes say "No separate plugin installation or license key is required", the source is in `d2layouts/d2talalayout` under D2's MPL-2.0, and a test render with no token set has no watermark. So the old plugin is not installed, and should not be: D2 prefers its bundled TALA anyway, and the old binary is closed-source.

Neither tool uses the network to render. Install a new D2 the same way: download the release tarball and `SHA256SUMS` into an empty folder, check them with `sha256sum -c --ignore-missing SHA256SUMS`, and copy `bin/d2` to `~/.local/bin/`. Don't pipe the install script from curl.
