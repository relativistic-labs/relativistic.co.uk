import { readFile } from 'node:fs/promises';

/**
 * Import .glsl files as minified strings: comments and spare whitespace removed, preprocessor
 * lines kept on their own lines. Shaders stay readable in the repo and small on the wire.
 */
export function minifyGlsl(source: string): string {
  const out: string[] = [];
  let code = '';
  for (const raw of source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (code) out.push(code), (code = '');
      out.push(line);
    } else {
      code += (code ? ' ' : '') + line;
    }
  }
  if (code) out.push(code);
  return out
    .map((l) => (l.startsWith('#') ? l : l.replace(/\s*([{}()[\];,=+\-*/<>!?:&|])\s*/g, '$1')))
    .join('\n');
}

export default function glsl() {
  return {
    name: 'relativistic-glsl',
    enforce: 'pre' as const,
    async load(id: string) {
      if (!id.endsWith('.glsl')) return null;
      const source = await readFile(id, 'utf8');
      return `export default ${JSON.stringify(minifyGlsl(source))};`;
    },
  };
}
