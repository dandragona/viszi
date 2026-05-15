export type Language =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'shell'
  | 'sql'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'markdown'
  | 'unknown';

const EXT_TO_LANG: Record<string, Language> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.mdx': 'markdown',
};

export function detectLanguage(path: string): Language {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'unknown';
  const ext = lower.slice(dot);
  return EXT_TO_LANG[ext] ?? 'unknown';
}

/** Languages we can reliably parse for imports / symbols. */
export const PARSEABLE: ReadonlySet<Language> = new Set([
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'python',
  'go',
]);

export function isCode(lang: Language): boolean {
  return PARSEABLE.has(lang);
}
