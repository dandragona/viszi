import { describe, it, expect } from 'vitest';
import { JsLikeParser } from '../../src/analyzer/parsers/regex_js.js';
import { PythonParser } from '../../src/analyzer/parsers/regex_python.js';
import { GoParser } from '../../src/analyzer/parsers/regex_go.js';

describe('JsLikeParser', () => {
  const p = new JsLikeParser();

  it('extracts named ESM imports + bound names', () => {
    const src = `import { a, b as bb } from './x.js';\nimport * as ns from './y.js';\nimport Default from './z.js';\n`;
    const parsed = p.parse('/abs/file.ts', 'file.ts', src);
    const xs = parsed.imports.find((i) => i.raw === './x.js');
    expect(xs?.boundNames).toEqual(expect.arrayContaining(['a', 'bb']));
    const ys = parsed.imports.find((i) => i.raw === './y.js');
    expect(ys?.boundNames).toContain('ns');
    const zs = parsed.imports.find((i) => i.raw === './z.js');
    expect(zs?.boundNames).toContain('Default');
  });

  it('extracts require, dynamic import and side-effect imports', () => {
    const src = `import './sideeffect.js';\nconst pkg = require('lodash');\nawait import('./dyn.js');\n`;
    const parsed = p.parse('/f.js', 'f.js', src);
    const raws = parsed.imports.map((i) => i.raw);
    expect(raws).toEqual(expect.arrayContaining(['./sideeffect.js', 'lodash', './dyn.js']));
    expect(parsed.imports.find((i) => i.raw === 'lodash')?.kind).toBe('require');
    expect(parsed.imports.find((i) => i.raw === './dyn.js')?.kind).toBe('dynamic');
  });

  it('records exported symbols and HTTP handlers (express/fastify-like)', () => {
    const src = `
export function handler() {}
export class Service {}
export const value = 1;
app.get('/a', () => {});
app.post('/b', () => {});
fastify.route({ method: 'PUT', url: '/c' });
`;
    const parsed = p.parse('/r.ts', 'r.ts', src);
    const expSyms = parsed.symbols.filter((s) => s.exported).map((s) => s.name);
    expect(expSyms).toEqual(expect.arrayContaining(['handler', 'Service', 'value']));
    const methods = parsed.httpHandlers.map((h) => `${h.method} ${h.path}`);
    expect(methods).toEqual(expect.arrayContaining(['GET /a', 'POST /b', 'PUT /c']));
  });

  it('records callsites pointing to imported names only', () => {
    const src = `import { computeThing } from './util.js';
import { unused } from './util2.js';
computeThing();
Math.max(1, 2);
console.log('noise');
`;
    const parsed = p.parse('/c.ts', 'c.ts', src);
    const callees = parsed.callsites.map((c) => c.callee);
    expect(callees).toContain('computeThing');
    expect(callees).not.toContain('Math');
    expect(callees).not.toContain('console');
    const cs = parsed.callsites.find((c) => c.callee === 'computeThing');
    expect(cs?.fromImport).toBe('./util.js');
  });
});

describe('PythonParser', () => {
  const p = new PythonParser();

  it('extracts from/import imports and defs', () => {
    const src = `from src.db import db\nimport os\n\ndef do_work():\n    return db.query('select 1')\n\nclass Worker:\n    pass\n`;
    const parsed = p.parse('/w.py', 'w.py', src);
    const raws = parsed.imports.map((i) => i.raw);
    expect(raws).toEqual(expect.arrayContaining(['src.db', 'os']));
    const names = parsed.symbols.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['do_work', 'Worker']));
  });

  it('detects Flask + FastAPI route decorators', () => {
    const src = `@app.route('/health', methods=['GET'])\ndef h(): pass\n\n@router.post('/items')\ndef create(): pass\n`;
    const parsed = p.parse('/r.py', 'r.py', src);
    const sigs = parsed.httpHandlers.map((h) => `${h.method} ${h.path}`);
    expect(sigs).toEqual(expect.arrayContaining(['GET /health', 'POST /items']));
  });
});

describe('GoParser', () => {
  const p = new GoParser();

  it('extracts imports, func decls and exported-vs-unexported', () => {
    const src = `package main\n\nimport "net/http"\nimport (\n  "fmt"\n  "github.com/x/y"\n)\n\nfunc Run() {}\nfunc private() {}\n\ntype Server struct{}\n`;
    const parsed = p.parse('/m.go', 'm.go', src);
    const raws = parsed.imports.map((i) => i.raw);
    expect(raws).toEqual(expect.arrayContaining(['net/http', 'fmt', 'github.com/x/y']));
    const run = parsed.symbols.find((s) => s.name === 'Run');
    expect(run?.exported).toBe(true);
    const priv = parsed.symbols.find((s) => s.name === 'private');
    expect(priv?.exported).toBe(false);
    const t = parsed.symbols.find((s) => s.name === 'Server');
    expect(t?.kind).toBe('type');
  });

  it('detects net/http and mux-style HTTP handlers', () => {
    const src = `http.HandleFunc("/a", h)\nrouter.Get("/b", handler)\n`;
    const parsed = p.parse('/h.go', 'h.go', src);
    const paths = parsed.httpHandlers.map((h) => h.path);
    expect(paths).toEqual(expect.arrayContaining(['/a', '/b']));
  });
});
