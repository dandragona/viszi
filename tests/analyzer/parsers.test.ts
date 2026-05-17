import { describe, it, expect } from 'vitest';
import { JsLikeParser } from '../../src/analyzer/parsers/regex_js.js';
import { PythonTreeSitterParser } from '../../src/analyzer/parsers/tree_sitter_python.js';
import { GoTreeSitterParser } from '../../src/analyzer/parsers/tree_sitter_go.js';

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

describe('PythonTreeSitterParser', () => {
  const p = new PythonTreeSitterParser();

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

  it('extracts callsites and links them back to from-imports', () => {
    const src = `from .util import compute_thing\nimport requests\n\ndef job():\n    x = compute_thing()\n    return requests.get('http://x').json()\n`;
    const parsed = p.parse('/j.py', 'j.py', src);
    const callees = parsed.callsites.map((c) => c.callee);
    expect(callees).toContain('compute_thing');
    expect(callees).toContain('get');
    const cs = parsed.callsites.find((c) => c.callee === 'compute_thing');
    expect(cs?.fromImport).toBe('.util');
  });

  it('marks underscore-prefixed names as unexported', () => {
    const src = `def _helper(): pass\ndef public(): pass\n`;
    const parsed = p.parse('/u.py', 'u.py', src);
    expect(parsed.symbols.find((s) => s.name === '_helper')?.exported).toBe(false);
    expect(parsed.symbols.find((s) => s.name === 'public')?.exported).toBe(true);
  });

  it('skips nested defs (only top-level symbols)', () => {
    const src = `class Outer:\n    def method(self): pass\n\ndef top():\n    def inner(): pass\n    return inner\n`;
    const parsed = p.parse('/n.py', 'n.py', src);
    const names = parsed.symbols.map((s) => s.name);
    expect(names).toContain('Outer');
    expect(names).toContain('top');
    expect(names).not.toContain('method');
    expect(names).not.toContain('inner');
  });
});

describe('GoTreeSitterParser', () => {
  const p = new GoTreeSitterParser();

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
    const src = `package x\nfunc setup() {\n  http.HandleFunc("/a", h)\n  router.Get("/b", handler)\n}\n`;
    const parsed = p.parse('/h.go', 'h.go', src);
    const paths = parsed.httpHandlers.map((h) => h.path);
    expect(paths).toEqual(expect.arrayContaining(['/a', '/b']));
  });

  it('extracts callsites for method calls and bare calls', () => {
    const src = `package main\nimport "log"\nfunc run() {\n  log.Println("hi")\n  process()\n  s.Save()\n}\nfunc process() {}\n`;
    const parsed = p.parse('/c.go', 'c.go', src);
    const callees = parsed.callsites.map((c) => c.callee);
    expect(callees).toContain('Println');
    expect(callees).toContain('process');
    expect(callees).toContain('Save');
  });

  it('captures methods on receivers and top-level type/const/var', () => {
    const src = `package x\ntype S struct{}\nfunc (s *S) Do() {}\nconst Tag = "v1"\nvar count = 0\n`;
    const parsed = p.parse('/r.go', 'r.go', src);
    const names = parsed.symbols.map((s) => s.name);
    expect(names).toContain('S');
    expect(names).toContain('Do');
    expect(names).toContain('Tag');
    expect(names).toContain('count');
  });
});
