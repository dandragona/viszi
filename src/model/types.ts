// Core diagram types shared between the CLI, the writer, the server, and the frontend.

export type DiagramKind = 'system' | 'flow';

export type ComponentKind =
  | 'service'
  | 'controller'
  | 'database'
  | 'queue'
  | 'cache'
  | 'ui'
  | 'library'
  | 'cli'
  | 'job'
  | 'config'
  | 'external'
  | 'module'
  | 'unknown';

export type FlowTrigger = 'http' | 'cli' | 'cron' | 'event' | 'init' | 'other';

export type EdgeKind = 'imports' | 'calls' | 'reads' | 'writes' | 'emits' | 'flow';

export interface DiagramNode {
  id: string;
  label: string;
  kind: ComponentKind;
  description?: string;
  files: string[];
  subDiagramId?: string;
  meta?: Record<string, unknown>;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: EdgeKind;
  weight?: number;
}

export interface SystemDiagram {
  id: string;
  kind: 'system';
  level: number;
  parentId?: string;
  scope: string;
  title: string;
  description?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Diagram-level metadata. Currently only `regenCacheKey` for `viszi regen`. */
  meta?: { regenCacheKey?: string };
}

export interface FlowStep {
  id: string;
  order: number;
  componentId: string;
  action: string;
  description?: string;
  subDiagramId?: string;
}

export interface FlowDiagram {
  id: string;
  kind: 'flow';
  level: number;
  parentId?: string;
  title: string;
  description?: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /**
   * Diagram-level metadata.
   *  - `regenCacheKey`: cache filename used by `viszi regen`.
   *  - `monoComponent`: present when ≥ threshold of steps share one componentId,
   *    meaning the flow is effectively a list of method calls on one component
   *    rather than a multi-component interaction story. See #13 in
   *    007_Post_Launch_TODO.md.
   */
  meta?: {
    regenCacheKey?: string;
    monoComponent?: {
      componentId: string;
      componentLabel: string;
      /** Fraction of steps mapped to the dominant component (0–1). */
      share: number;
    };
  };
}

export type AnyDiagram = SystemDiagram | FlowDiagram;

export interface DiagramIndexEntry {
  id: string;
  kind: DiagramKind;
  level: number;
  title: string;
  parentId?: string;
  /**
   * Set when a flow is "mostly internal to one component" (#13). The sidebar
   * dims these and surfaces "mostly internal to X" — kept on the index so the
   * sidebar can render without loading every individual diagram file.
   */
  monoComponent?: { componentLabel: string; share: number };
}

export interface DiagramIndex {
  version: string;
  generatedAt: string;
  generatedFor: string;
  rootSystemId: string;
  flows: { id: string; title: string; trigger: FlowTrigger }[];
  diagrams: DiagramIndexEntry[];
  meta: {
    levels: number;
    flowsEnabled: boolean;
    aiCallCount: number;
    estimatedCostUsd?: number;
  };
}
