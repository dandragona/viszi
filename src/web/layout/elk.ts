import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from 'reactflow';

const elk = new ELK();

export interface LayoutOpts {
  direction?: 'RIGHT' | 'DOWN';
  nodeWidth?: number;
  nodeHeight?: number;
}

export async function layoutWithElk(nodes: Node[], edges: Edge[], opts: LayoutOpts = {}): Promise<Node[]> {
  const direction = opts.direction ?? 'RIGHT';
  const nodeWidth = opts.nodeWidth ?? 240;
  const nodeHeight = opts.nodeHeight ?? 110;

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '60',
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      'elk.edgeRouting': 'SPLINES',
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: nodeWidth,
      height: nodeHeight,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(elkGraph as never);
  const positioned = new Map<string, { x: number; y: number }>();
  for (const child of layout.children ?? []) {
    if (child.id) positioned.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return nodes.map((n) => ({
    ...n,
    position: positioned.get(n.id) ?? n.position ?? { x: 0, y: 0 },
  }));
}
