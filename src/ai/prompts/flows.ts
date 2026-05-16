import type { Entrypoint } from '../../analyzer/entrypoints.js';

export interface FlowsPromptInput {
  scope: string;
  componentSummary: Array<{ id: string; label: string; kind: string; description?: string }>;
  entrypoints: Entrypoint[];
  graphSummary: { files: number; loc: number; edges: number };
  parentFlowName?: string;
  parentStepAction?: string;
  level: number;
  totalLevels: number;
}

export function buildFlowsPrompt(input: FlowsPromptInput): string {
  const {
    scope,
    componentSummary,
    entrypoints,
    graphSummary,
    parentFlowName,
    parentStepAction,
    level,
    totalLevels,
  } = input;

  const subContext = parentFlowName
    ? `\nThis is a sub-flow drilling into the step "${parentStepAction ?? ''}" of the parent flow "${parentFlowName}".`
    : '';

  return `You are an expert software architect. You are identifying the **important user-visible or system-critical flows** in this codebase.

Scope: \`${scope || '/'}\`
Flow tier: ${level} of ${totalLevels}${subContext}
Codebase summary: ${graphSummary.files} files, ~${graphSummary.loc} LOC, ${graphSummary.edges} import edges.

Components present in this scope:

\`\`\`json
${JSON.stringify(componentSummary, null, 2)}
\`\`\`

Detected entry points (HTTP routes, CLI commands, cron jobs, init scripts):

\`\`\`json
${JSON.stringify(entrypoints.slice(0, 30), null, 2)}
\`\`\`

Your job:
${
  level === 1
    ? `1. Identify **3-8 important flows** that capture how this codebase actually does its work. Examples: "User signs up", "Process payment", "Sync data from upstream", "Render dashboard", "Run nightly aggregation".
2. Each flow has a single **trigger** kind: http, cli, cron, event, init, or other.
3. For each flow, write **3-10 ordered steps** — each step references one of the **componentId**s above and describes a single concrete action.
4. Be concrete and grounded in the components we listed; do not invent components that aren't there.`
    : `1. Identify 1-4 sub-flows that elaborate the parent step. Each captures a meaningful sub-sequence inside that step.
2. Each flow has **3-8 ordered steps** that reference componentId(s) from the list above.
3. Be specific: name what is checked, fetched, written, or published.`
}

## Step-quality rules (these matter)

Each step's \`action\` must be a **single, verb-led, observable behaviour** — not a re-statement of what the component does. The reader should be able to point to one place in the code that does this exact thing.

**GOOD** action labels:
- "validates request schema"
- "writes audit log to db"
- "publishes \`user.created\` event"
- "fetches subscription from billing api"
- "renders payment summary"

**BAD** action labels (avoid these shapes):
- "Initialize X storage" — describes the component, not a step
- "Run main pipeline stages" — vague + circular
- "Handle the request" — not specific enough
- "Process payment" as a single step inside the "Process payment" flow — restates the flow name

**Step composition rules:**
- Do NOT pad step count. If a flow has 4 real steps, output 4 — not 8.
- Do NOT emit two consecutive steps with the **same componentId** unless they are genuinely distinct actions (e.g. "validates input" then "writes audit log" on the same controller is OK; "processes the request" then "handles the data" is not — those are the same step described twice).
- Prefer flows where the steps span **multiple components**. A flow that lives entirely inside one component is usually a method-call list, not a flow; in that case prefer a tighter 3-4 step view that elides the internal hops.

Use lowercase-kebab-case for flow ids (e.g. "user-signup"). Reply with structured JSON matching the provided schema.`;
}
