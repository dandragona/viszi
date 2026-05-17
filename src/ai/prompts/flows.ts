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
  /**
   * Optional free-text narrative from a prior stage-1 call describing the
   * flows that should be emitted. See ADR-013 (two-stage AI).
   */
  explanation?: string;
}

/**
 * Stage-1 prompt for flows: ask Claude to list the important flows in prose
 * before producing the schema-constrained JSON. The narrative is injected
 * back into the stage-2 prompt via `FlowsPromptInput.explanation`.
 */
export function buildFlowsExplanationPrompt(input: Omit<FlowsPromptInput, 'explanation'>): string {
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

  const guidance =
    level === 1
      ? `Cover, in this order:

1. **The 3-8 most important user-visible or system-critical flows** — name each one (e.g. "User signs up", "Process payment", "Sync data from upstream"). One sentence per flow on what triggers it and what its outcome is.
2. **For each flow, the rough sequence of components it touches** — just the component labels in order, no step-level detail yet. This is the spine the stage-2 call will fill in.
3. **The one flow a new engineer should read first** — call it out explicitly.`
      : `Cover:

1. **1-4 meaningful sub-sequences** that elaborate the parent step.
2. For each, the components touched, in order.`;

  return `You are an expert software architect studying this codebase's runtime behavior. **Do not produce a diagram yet.** Write a short narrative (150-250 words) describing the important flows in this scope.

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

${guidance}

Be **specific to this codebase** — name actual routes, commands, or business operations. Do not invent flows that aren't grounded in the components or entrypoints above. Do not output JSON. This narrative will be the only context for the next call, which produces the structured flow diagrams.`;
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
    explanation,
  } = input;

  const subContext = parentFlowName
    ? `\nThis is a sub-flow drilling into the step "${parentStepAction ?? ''}" of the parent flow "${parentFlowName}".`
    : '';

  const explanationBlock = explanation
    ? `\n\n## Prior flows narrative\n\nA stage-1 call produced this narrative naming the flows that should exist in this scope and the components each one touches. Use it as the ground truth for flow naming, trigger classification, and which components each flow's steps reference. If a flow named in the narrative is missing from your output, you have made a mistake.\n\n<prior_explanation>\n${explanation.trim()}\n</prior_explanation>`
    : '';

  return `You are an expert software architect. You are identifying the **important user-visible or system-critical flows** in this codebase.

Scope: \`${scope || '/'}\`
Flow tier: ${level} of ${totalLevels}${subContext}
Codebase summary: ${graphSummary.files} files, ~${graphSummary.loc} LOC, ${graphSummary.edges} import edges.${explanationBlock}

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

Each step has three fields you must fill: \`action\`, \`description\`, and \`files\`.

**\`action\`** — a **single, verb-led, observable behaviour** — not a re-statement of what the component does. The reader should be able to point to one place in the code that does this exact thing.

GOOD action labels:
- "validates request schema"
- "writes audit log to db"
- "publishes \`user.created\` event"
- "fetches subscription from billing api"
- "renders payment summary"

BAD action labels (avoid these shapes):
- "Initialize X storage" — describes the component, not a step
- "Run main pipeline stages" — vague + circular
- "Handle the request" — not specific enough
- "Process payment" as a single step inside the "Process payment" flow — restates the flow name

**\`description\`** — one short sentence (≤ 280 chars) explaining **why** this step exists or what business/architectural constraint it enforces. The \`action\` says *what mechanically happens*; \`description\` says *what it's there for*. This is required for every step.

GOOD descriptions:
- "Schema validation runs before any DB write so malformed payloads can't corrupt downstream state."
- "Audit log capture is mandated by SOC2 — every state-changing request must leave a row here."
- "Cache lookup short-circuits the expensive provider call when a recent quote exists."

BAD descriptions:
- "Validates the request" — restates the action
- "Important step" — empty calorie
- "This component handles validation" — describes the component

**\`files\`** — cite **1–2 source file paths** (at most 5) from the step's \`componentId\` member list that implement this exact step. Use the paths as they appear in the component's \`members\` array — no fuzzy matches, no invented paths. Empty list is OK only when the step is truly cross-cutting (e.g. "downstream service publishes back" where the implementer lives outside this scope).

**Step composition rules:**
- Do NOT pad step count. If a flow has 4 real steps, output 4 — not 8.
- Do NOT emit two consecutive steps with the **same componentId** unless they are genuinely distinct actions (e.g. "validates input" then "writes audit log" on the same controller is OK; "processes the request" then "handles the data" is not — those are the same step described twice).
- Prefer flows where the steps span **multiple components**. A flow that lives entirely inside one component is usually a method-call list, not a flow; in that case prefer a tighter 3-4 step view that elides the internal hops.

Use lowercase-kebab-case for flow ids (e.g. "user-signup"). Reply with structured JSON matching the provided schema.`;
}
