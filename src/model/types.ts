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
}

export type AnyDiagram = SystemDiagram | FlowDiagram;

export interface DiagramIndexEntry {
  id: string;
  kind: DiagramKind;
  level: number;
  title: string;
  parentId?: string;
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
