// Icons and color classes for categories and severities, shared by all report components.
import type { Category, Severity } from '@qa/shared';
import {
  Accessibility,
  Bug,
  FileText,
  Gauge,
  Image,
  Info,
  Link2,
  OctagonAlert,
  Scale,
  Search,
  Smartphone,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  links: Link2,
  images: Image,
  seo: Search,
  mobile: Smartphone,
  performance: Gauge,
  technical: Bug,
  content: FileText,
  legal: Scale,
  accessibility: Accessibility,
};

export const SEVERITY_ICONS: Record<Severity, LucideIcon> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
};

/** Text color, tinted background and border for each severity (tokens from styles.css). */
export const SEVERITY_STYLES: Record<Severity, { text: string; soft: string; border: string; bar: string }> = {
  critical: { text: 'text-critical', soft: 'bg-critical/10', border: 'border-critical/30', bar: 'bg-critical' },
  warning: { text: 'text-warning', soft: 'bg-warning/10', border: 'border-warning/30', bar: 'bg-warning' },
  info: { text: 'text-info', soft: 'bg-info/10', border: 'border-info/30', bar: 'bg-info' },
};

