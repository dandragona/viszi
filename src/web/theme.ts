import type { ComponentKind } from '../model/types.js';

export interface KindStyle {
  accent: string;
  background: string;
  border: string;
  icon: string;
  text: string;
  glow: string;
}

/**
 * Per-kind palette. 13 distinct hues — every `ComponentKind` gets its own
 * colour so the previous service/module (both blue) and library/config/
 * external/unknown (all slate) collisions can't happen.
 *
 * Hues chosen for distinguishability under deuteranopia/protanopia: blue,
 * cyan, emerald, amber, red, violet, slate, pink, teal, stone, orange,
 * indigo, zinc are well-separated on the hue wheel and also vary in
 * lightness so monochrome viewers can still tell adjacent kinds apart.
 */
const KIND_TO_STYLE: Record<ComponentKind, KindStyle & { icon: string; text: string }> = {
  service: {
    accent: '#3b82f6',
    background: 'rgba(59,130,246,0.10)',
    border: 'rgba(96,165,250,0.55)',
    glow: 'rgba(59,130,246,0.30)',
    icon: 'cpu',
    text: '#dbeafe',
  },
  controller: {
    accent: '#06b6d4',
    background: 'rgba(6,182,212,0.10)',
    border: 'rgba(34,211,238,0.55)',
    glow: 'rgba(6,182,212,0.30)',
    icon: 'route',
    text: '#cffafe',
  },
  database: {
    accent: '#10b981',
    background: 'rgba(16,185,129,0.10)',
    border: 'rgba(52,211,153,0.55)',
    glow: 'rgba(16,185,129,0.30)',
    icon: 'database',
    text: '#d1fae5',
  },
  queue: {
    accent: '#f59e0b',
    background: 'rgba(245,158,11,0.10)',
    border: 'rgba(251,191,36,0.55)',
    glow: 'rgba(245,158,11,0.30)',
    icon: 'list-ordered',
    text: '#fef3c7',
  },
  cache: {
    accent: '#ef4444',
    background: 'rgba(239,68,68,0.10)',
    border: 'rgba(248,113,113,0.55)',
    glow: 'rgba(239,68,68,0.30)',
    icon: 'zap',
    text: '#fee2e2',
  },
  ui: {
    accent: '#8b5cf6',
    background: 'rgba(139,92,246,0.10)',
    border: 'rgba(167,139,250,0.55)',
    glow: 'rgba(139,92,246,0.30)',
    icon: 'layout',
    text: '#ede9fe',
  },
  library: {
    accent: '#94a3b8',
    background: 'rgba(148,163,184,0.10)',
    border: 'rgba(148,163,184,0.55)',
    glow: 'rgba(100,116,139,0.25)',
    icon: 'package',
    text: '#e2e8f0',
  },
  cli: {
    accent: '#ec4899',
    background: 'rgba(236,72,153,0.10)',
    border: 'rgba(244,114,182,0.55)',
    glow: 'rgba(236,72,153,0.30)',
    icon: 'terminal',
    text: '#fce7f3',
  },
  job: {
    accent: '#14b8a6',
    background: 'rgba(20,184,166,0.10)',
    border: 'rgba(45,212,191,0.55)',
    glow: 'rgba(20,184,166,0.30)',
    icon: 'clock',
    text: '#ccfbf1',
  },
  config: {
    accent: '#a8a29e',
    background: 'rgba(168,162,158,0.10)',
    border: 'rgba(168,162,158,0.55)',
    glow: 'rgba(120,113,108,0.25)',
    icon: 'settings',
    text: '#e7e5e4',
  },
  external: {
    accent: '#fb923c',
    background: 'rgba(251,146,60,0.10)',
    border: 'rgba(253,186,116,0.55)',
    glow: 'rgba(251,146,60,0.30)',
    icon: 'globe',
    text: '#ffedd5',
  },
  module: {
    accent: '#818cf8',
    background: 'rgba(129,140,248,0.10)',
    border: 'rgba(165,180,252,0.55)',
    glow: 'rgba(129,140,248,0.30)',
    icon: 'box',
    text: '#e0e7ff',
  },
  unknown: {
    accent: '#71717a',
    background: 'rgba(113,113,122,0.10)',
    border: 'rgba(161,161,170,0.55)',
    glow: 'rgba(113,113,122,0.25)',
    icon: 'help-circle',
    text: '#e4e4e7',
  },
};

export function styleForKind(kind: ComponentKind): KindStyle & { icon: string; text: string } {
  return KIND_TO_STYLE[kind] ?? KIND_TO_STYLE.unknown;
}

export const COMPONENT_KINDS: ComponentKind[] = [
  'service',
  'controller',
  'database',
  'queue',
  'cache',
  'ui',
  'library',
  'cli',
  'job',
  'config',
  'external',
  'module',
  'unknown',
];

export const TRIGGER_ICON: Record<string, string> = {
  http: 'globe',
  cli: 'terminal',
  cron: 'clock',
  event: 'radio',
  init: 'power',
  other: 'help-circle',
};
