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
  } = input;

  const parentBlock = parentLabel
    ? `\nThis sub-diagram is for the **${parentLabel}** component of the parent system.${
        parentDescription ? ` Parent description: ${parentDescription}` : ''
      }`
    : '';

  return `You are an expert software architect. You are looking at a ${
    level === 1 ? 'whole codebase' : 'sub-section of a codebase'
  } and producing a system architecture diagram.

Scope: \`${scope || '/'}\`
Diagram level: ${level} of ${totalLevels}${parentBlock}
Codebase summary: ${graphSummary.files} parseable files, ~${graphSummary.loc} LOC, ${graphSummary.edges} import edges.

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
