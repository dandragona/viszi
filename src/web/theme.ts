import type { ComponentKind } from '../model/types.js';

export interface KindStyle {
  accent: string;
  background: string;
  border: string;
  icon: string;
  text: string;
  glow: string;
}

const COLORS = {
  blue: { accent: '#60a5fa', background: 'rgba(59,130,246,0.10)', border: 'rgba(96,165,250,0.55)', glow: 'rgba(59,130,246,0.30)' },
  violet: { accent: '#a78bfa', background: 'rgba(139,92,246,0.10)', border: 'rgba(167,139,250,0.55)', glow: 'rgba(139,92,246,0.30)' },
  emerald: { accent: '#34d399', background: 'rgba(16,185,129,0.10)', border: 'rgba(52,211,153,0.55)', glow: 'rgba(16,185,129,0.30)' },
  amber: { accent: '#fbbf24', background: 'rgba(245,158,11,0.10)', border: 'rgba(251,191,36,0.55)', glow: 'rgba(245,158,11,0.30)' },
  rose: { accent: '#fb7185', background: 'rgba(244,63,94,0.10)', border: 'rgba(251,113,133,0.55)', glow: 'rgba(244,63,94,0.30)' },
  cyan: { accent: '#22d3ee', background: 'rgba(6,182,212,0.10)', border: 'rgba(34,211,238,0.55)', glow: 'rgba(6,182,212,0.30)' },
  slate: { accent: '#94a3b8', background: 'rgba(100,116,139,0.10)', border: 'rgba(148,163,184,0.55)', glow: 'rgba(100,116,139,0.25)' },
  pink: { accent: '#f472b6', background: 'rgba(236,72,153,0.10)', border: 'rgba(244,114,182,0.55)', glow: 'rgba(236,72,153,0.30)' },
};

const KIND_TO_STYLE: Record<ComponentKind, KindStyle & { icon: string; text: string }> = {
  service: { ...COLORS.blue, icon: 'cpu', text: '#dbeafe' },
  controller: { ...COLORS.cyan, icon: 'route', text: '#cffafe' },
  database: { ...COLORS.emerald, icon: 'database', text: '#d1fae5' },
  queue: { ...COLORS.amber, icon: 'list-ordered', text: '#fef3c7' },
  cache: { ...COLORS.rose, icon: 'zap', text: '#ffe4e6' },
  ui: { ...COLORS.violet, icon: 'layout', text: '#ede9fe' },
  library: { ...COLORS.slate, icon: 'package', text: '#e2e8f0' },
  cli: { ...COLORS.pink, icon: 'terminal', text: '#fce7f3' },
  job: { ...COLORS.amber, icon: 'clock', text: '#fef3c7' },
  config: { ...COLORS.slate, icon: 'settings', text: '#e2e8f0' },
  external: { ...COLORS.slate, icon: 'globe', text: '#e2e8f0' },
  module: { ...COLORS.blue, icon: 'box', text: '#dbeafe' },
  unknown: { ...COLORS.slate, icon: 'help-circle', text: '#e2e8f0' },
};

export function styleForKind(kind: ComponentKind): KindStyle & { icon: string; text: string } {
  return KIND_TO_STYLE[kind] ?? KIND_TO_STYLE.unknown;
}

export const TRIGGER_ICON: Record<string, string> = {
  http: 'globe',
  cli: 'terminal',
  cron: 'clock',
  event: 'radio',
  init: 'power',
  other: 'help-circle',
};
