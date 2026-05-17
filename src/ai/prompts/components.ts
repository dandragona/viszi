import type { modulesForPrompt } from '../../analyzer/modules.js';

export interface ComponentsPromptInput {
  scope: string;
  level: number;
  totalLevels: number;
  parentLabel?: string;
  parentDescription?: string;
  modules: ReturnType<typeof modulesForPrompt>;
  graphSummary: { files: number; loc: number; edges: number };
  hint?: string;
  /**
   * Optional free-text architectural narrative from a prior stage-1 call.
   * When present, the schema-constrained call leans on this prose for
   * naming, grouping, and edge selection. See ADR-013 (two-stage AI).
   */
  explanation?: string;
}

/**
 * Stage-1 prompt for the two-stage AI pipeline. Asks Claude for a short
 * architectural narrative (no schema). The prose is then injected into
 * `buildComponentsPrompt` via the `explanation` field so the schema-
 * constrained stage-2 call has cleaner reasoning to lean on.
 */
export function buildComponentsExplanationPrompt(
  input: Omit<ComponentsPromptInput, 'explanation'>,
): string {
  const { scope, level, totalLevels, parentLabel, parentDescription, modules, graphSummary, hint } =
    input;

  const parentBlock = parentLabel
    ? `\nThis sub-diagram is for the **${parentLabel}** component of the parent system.${
        parentDescription ? ` Parent description: ${parentDescription}` : ''
      }`
    : '';

  return `You are an expert software architect studying a codebase. **Do not produce a diagram yet.** Write a short architectural narrative (150-250 words) that a senior engineer reading this scope for the first time would want to read.

Scope: \`${scope || '/'}\`
Diagram level: ${level} of ${totalLevels}${parentBlock}
Codebase summary: ${graphSummary.files} parseable files, ~${graphSummary.loc} LOC, ${graphSummary.edges} import edges.

Pre-clustered candidate modules (id + sample files + import/call edges):

\`\`\`json
${JSON.stringify(modules, null, 2)}
\`\`\`

Cover, in this order:

1. **The job** — one sentence on what this scope's purpose is in the larger system.
2. **The 3-8 most important logical components** — name each one with a label a senior engineer would recognise (e.g. "Auth Service", "Postgres Adapter", "Background Worker"), and give one short sentence on what it does. Use the codebase's actual vocabulary.
3. **The 3-6 most architecturally important relationships** — what calls what, what reads/writes data where. Ignore trivial imports.
4. **Anything subtle** — dynamic dispatch, plugin patterns, multiple entrypoints, where the LLM/IO/state lives, hidden coupling. Skip if there's nothing notable.

Be **opinionated and concise**. Do not enumerate every module. Do not output JSON. This narrative will be the only context for the next call, which produces the actual structured diagram.${hint ? `\n\nAdditional hints from configuration: ${hint}` : ''}`;
}

export function buildComponentsPrompt(input: ComponentsPromptInput): string {
  const {
    scope,
    level,
    totalLevels,
    parentLabel,
    parentDescription,
    modules,
    graphSummary,
    hint,
    explanation,
  } = input;

  const parentBlock = parentLabel
    ? `\nThis sub-diagram is for the **${parentLabel}** component of the parent system.${
        parentDescription ? ` Parent description: ${parentDescription}` : ''
      }`
    : '';

  const explanationBlock = explanation
    ? `\n\n## Prior architectural narrative\n\nA stage-1 call produced this narrative for the same scope. Use it as the ground truth for component naming, grouping decisions, and which edges matter. If the narrative disagrees with the raw module list, prefer the narrative — it represents intentional architectural judgement.\n\n<prior_explanation>\n${explanation.trim()}\n</prior_explanation>`
    : '';

  return `You are an expert software architect. You are looking at a ${
    level === 1 ? 'whole codebase' : 'sub-section of a codebase'
  } and producing a system architecture diagram.

Scope: \`${scope || '/'}\`
Diagram level: ${level} of ${totalLevels}${parentBlock}
Codebase summary: ${graphSummary.files} parseable files, ~${graphSummary.loc} LOC, ${graphSummary.edges} import edges.${explanationBlock}

The codebase has been pre-clustered into the following candidate modules. Each module has an \`id\` you may reference; sample files give you a hint of what's inside. Each module also lists the modules it **imports from** (static dependency) and the modules it **calls into** (function call sites). When both signals point to the same target, the relationship is structural; when only \`callsModules\` lights up, it's a runtime/dynamic dependency.

\`\`\`json
${JSON.stringify(modules, null, 2)}
\`\`\`

Your job:
1. Group these modules into 3-12 named **components** that a senior engineer would recognise as logical units. Examples of good component names: "Auth Service", "Postgres Adapter", "Background Worker", "React UI", "Public API", "Billing Engine". Use the codebase's actual vocabulary where possible.
2. Pick a **kind** for each component from this list: service, controller, database, queue, cache, ui, library, cli, job, config, external, module, unknown.
3. For each component, list its **members** — the module \`id\`s that belong to it. Every supplied module id should appear in exactly one component (do not invent module ids).
4. Add **edges** between components for important relationships. Use the existing module-to-module imports + calls as evidence (\`importsModules\` for compile-time dependencies, \`callsModules\` for runtime call edges). Choose \`kind: 'calls'\` when the relationship is primarily a function-call dependency, and \`'imports'\` when it's structural. Do not include every edge — only the architecturally meaningful ones.
5. Write a one-sentence **description** for each component explaining what it does in this codebase.
${hint ? `\nAdditional hints from configuration: ${hint}` : ''}

Reply with structured JSON matching the provided schema. Use lowercase-kebab-case for component ids (e.g. "auth-service"). Be decisive and concise.`;
}
