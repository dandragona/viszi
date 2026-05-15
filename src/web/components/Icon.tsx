import {
  Box,
  Clock,
  Cpu,
  Database,
  Globe,
  HelpCircle,
  Layout,
  ListOrdered,
  Package,
  Power,
  Radio,
  Route,
  Settings,
  Terminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const REGISTRY: Record<string, LucideIcon> = {
  cpu: Cpu,
  route: Route,
  database: Database,
  'list-ordered': ListOrdered,
  zap: Zap,
  layout: Layout,
  package: Package,
  terminal: Terminal,
  clock: Clock,
  settings: Settings,
  globe: Globe,
  box: Box,
  'help-circle': HelpCircle,
  radio: Radio,
  power: Power,
};

export function Icon({ name, size = 14, strokeWidth = 1.75 }: { name: string; size?: number; strokeWidth?: number }) {
  const C = REGISTRY[name] ?? HelpCircle;
  return <C size={size} strokeWidth={strokeWidth} />;
}
