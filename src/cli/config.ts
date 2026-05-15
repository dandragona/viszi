import { cosmiconfig } from 'cosmiconfig';
import type { VisziConfig } from '../ai/orchestrator.js';

const explorer = cosmiconfig('viszi', {
  searchPlaces: [
    'package.json',
    '.viszirc',
    '.viszirc.json',
    '.viszi.json',
    'viszi.config.json',
    'viszi.config.js',
  ],
});

export async function loadConfig(searchFrom: string): Promise<VisziConfig | undefined> {
  const result = await explorer.search(searchFrom);
  if (!result) return undefined;
  return result.config as VisziConfig;
}
