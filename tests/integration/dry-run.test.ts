import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runAnalysis } from '../../src/ai/orchestrator.js';
import { indexFile, diagramsSubdir } from '../../src/shared/paths.js';
import Ajv from 'ajv';
import { ComponentsSchema, FlowsSchema } from '../../src/ai/schemas.js';

const FIXTURE = resolve(__dirname, '../fixtures/sample-repo');

let outputDir: string;

beforeAll(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'viszi-dryrun-'));
});

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

describe('runAnalysis --dry-run', () => {
  it('produces index.json + at least one diagram without calling Claude', async () => {
    const result = await runAnalysis({
      repoRoot: FIXTURE,
      outputDir,
      levels: 2,
      flowsEnabled: true,
      concurrency: 2,
      maxBudgetUsd: 0.5,
      cache: false,
      dryRun: true,
    });

    expect(result.diagramCount).toBeGreaterThanOrEqual(1);
    expect(result.rootSystemId).toBeTruthy();

    // index.json was emitted and parses.
    expect(existsSync(indexFile(outputDir))).toBe(true);
    const index = JSON.parse(readFileSync(indexFile(outputDir), 'utf8')) as {
      diagrams: Array<{ id: string; kind: string }>;
    };
    expect(Array.isArray(index.diagrams)).toBe(true);
    expect(index.diagrams.length).toBe(result.diagramCount);

    // Diagrams directory has at least one *.json file.
    const diagramFiles = readdirSync(diagramsSubdir(outputDir)).filter((f) => f.endsWith('.json'));
    expect(diagramFiles.length).toBeGreaterThanOrEqual(1);

    // A system diagram exists, and its structural shape is sane.
    const sysEntry = index.diagrams.find((d) => d.kind === 'system');
    expect(sysEntry).toBeDefined();
  });

  it('respects --root-scope: only files under that scope appear in modules', async () => {
    const scopedDir = mkdtempSync(join(tmpdir(), 'viszi-dryrun-scope-'));
    try {
      await runAnalysis({
        repoRoot: FIXTURE,
        outputDir: scopedDir,
        levels: 1,
        flowsEnabled: false,
        rootScope: 'src',
        concurrency: 1,
        cache: false,
        dryRun: true,
      });
      const index = JSON.parse(readFileSync(indexFile(scopedDir), 'utf8')) as {
        diagrams: Array<{ id: string; kind: string }>;
      };
      const sysEntry = index.diagrams.find((d) => d.kind === 'system');
      if (!sysEntry) throw new Error('expected a system diagram');
      const diag = JSON.parse(
        readFileSync(join(diagramsSubdir(scopedDir), `${sysEntry.id}.json`), 'utf8'),
      ) as { nodes: Array<{ files: string[] }> };
      for (const n of diag.nodes) {
        for (const f of n.files) {
          expect(f.startsWith('src/'), `${f} should be under src/`).toBe(true);
        }
      }
    } finally {
      rmSync(scopedDir, { recursive: true, force: true });
    }
  });

  it('populates flow index entries with `shape` and `flowOrder` (009 #5 + #6)', async () => {
    const index = JSON.parse(readFileSync(indexFile(outputDir), 'utf8')) as {
      diagrams: Array<{
        id: string;
        kind: string;
        level: number;
        parentId?: string;
        shape?: string[];
        flowOrder?: number;
      }>;
    };
    const flowEntries = index.diagrams.filter((d) => d.kind === 'flow');
    expect(flowEntries.length).toBeGreaterThan(0);

    // Every flow entry (top-level + sub) gets a shape — one componentKind per step.
    for (const e of flowEntries) {
      expect(e.shape).toBeDefined();
      expect(Array.isArray(e.shape)).toBe(true);
      expect(e.shape!.length).toBeGreaterThan(0);
    }

    // Sub-flow entries (level > 1) carry a flowOrder pointing at their parent
    // step. Top-level flows have no flowOrder.
    const subFlows = flowEntries.filter((e) => e.level > 1);
    if (subFlows.length > 0) {
      for (const sf of subFlows) {
        expect(sf.flowOrder).toBeTypeOf('number');
        expect(sf.flowOrder).toBeGreaterThanOrEqual(1);
      }
    }
    const topFlows = flowEntries.filter((e) => e.level === 1);
    for (const tf of topFlows) {
      expect(tf.flowOrder).toBeUndefined();
    }
  });

  it('the mock components response validates against ComponentsSchema-shaped data', async () => {
    // After the run, read one system diagram and confirm its (id, label, kind, description)
    // tuples match the component-shape constraints in the schema.
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(ComponentsSchema);
    void FlowsSchema; // referenced to assert export exists

    const index = JSON.parse(readFileSync(indexFile(outputDir), 'utf8')) as {
      diagrams: Array<{ id: string; kind: string }>;
    };
    const sysEntry = index.diagrams.find((d) => d.kind === 'system');
    if (!sysEntry) throw new Error('expected a system diagram from --dry-run');
    const diagPath = join(diagramsSubdir(outputDir), `${sysEntry.id}.json`);
    const diag = JSON.parse(readFileSync(diagPath, 'utf8')) as {
      nodes: Array<{ id: string; label: string; kind: string; description?: string }>;
      edges: Array<{ source: string; target: string; kind: string }>;
    };

    // Reshape diagram nodes back to the AI-response shape, then validate.
    const reconstructed = {
      components: diag.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        kind: n.kind,
        description: n.description ?? 'Stub.',
        members: ['stub'],
      })),
      edges: diag.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind })),
    };
    const ok = validate(reconstructed);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });
});
