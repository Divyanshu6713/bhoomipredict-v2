import { create } from 'zustand';
import type { FeatureKey, Overrides } from './model';
import type { PortfolioSummary } from '@/data/types';
import { TODAY } from './world';

export const SECTIONS = [
  'hero',
  'journey',
  'chain',
  'causes',
  'signature',
  'bottleneck',
  'ai',
  'xai',
  'live',
  'officer',
  'capabilities',
  'command',
  'timeline',
  'district',
  'layers',
  'architecture',
  'ecosystem',
  'limits',
  'security',
  'return',
  'finale',
  'login',
] as const;
export type SectionId = (typeof SECTIONS)[number];

export const LAYERS = [
  { id: 'parcels', label: 'Parcels' },
  { id: 'status', label: 'Acquisition Status' },
  { id: 'risk', label: 'Risk' },
  { id: 'stage', label: 'Lifecycle Stage' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'litigation', label: 'Litigation' },
  { id: 'compensation', label: 'Compensation' },
  { id: 'rr', label: 'R&R' },
  { id: 'construction', label: 'Construction Dependency' },
  { id: 'landuse', label: 'Land Use' },
  { id: 'infra', label: 'Infrastructure' },
  { id: 'admin', label: 'Administrative Boundaries' },
] as const;
export type LayerId = (typeof LAYERS)[number]['id'];

export const ROLES = [
  {
    id: 'admin',
    label: 'Administrator',
    layer: 'risk' as LayerId,
    focus: 'Portfolio view: where risk is concentrated, and which alerts are unassigned.',
    panel: 'alerts' as const,
  },
  {
    id: 'lao',
    label: 'Land Acquisition Officer',
    layer: 'compensation' as LayerId,
    focus: 'Your queue: cases where a compensation or ownership check is due next.',
    panel: 'queue' as const,
  },
  {
    id: 'project',
    label: 'Project Authority',
    layer: 'construction' as LayerId,
    focus: 'Work fronts: which construction sections are waiting on land.',
    panel: 'fronts' as const,
  },
  {
    id: 'gis',
    label: 'GIS / Survey Officer',
    layer: 'admin' as LayerId,
    focus: 'Geometry and boundaries: survey status, land use and administrative units.',
    panel: 'survey' as const,
  },
  {
    id: 'legal',
    label: 'Legal Officer',
    layer: 'litigation' as LayerId,
    focus: 'Cases with an active legal matter that sits on a critical work front.',
    panel: 'cases' as const,
  },
];
export type RoleId = (typeof ROLES)[number]['id'];

export type CursorMode = 'default' | 'explore' | 'inspect' | 'explain' | 'drag';
export type Quality = 'high' | 'medium' | 'low';

export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  hash: string;
  prev: string;
}

interface State {
  active: SectionId;
  hovered: number;
  selected: number;
  focusId: string;
  layer: LayerId;
  role: RoleId;
  day: number;
  whatIf: Overrides;
  chainHover: string | null;
  xaiHover: FeatureKey | null;
  signatureStep: 0 | 1 | 2;
  stackHover: number;
  followCorridor: boolean;
  zoom: number;
  cursor: CursorMode;
  cursor3d: CursorMode;
  audit: AuditEntry[];
  /** Live portfolio summary from /api/summary (null until loaded or if the API is down). */
  summary: PortfolioSummary | null;
  /** Set while a transition veil closes: the camera dives into the land. */
  dive: boolean;
  quality: Quality;
  reduced: boolean;
  webgl: boolean;
  ready: boolean;
  set: (p: Partial<State>) => void;
  setLayer: (l: LayerId) => void;
  selectParcel: (idx: number) => void;
}

export const useStore = create<State>((set) => ({
  active: 'hero',
  hovered: -1,
  selected: -1,
  focusId: 'P-1042',
  layer: 'risk',
  role: 'admin',
  day: TODAY,
  whatIf: {},
  chainHover: null,
  xaiHover: null,
  signatureStep: 0,
  stackHover: -1,
  followCorridor: false,
  zoom: 1,
  cursor: 'default',
  cursor3d: 'default',
  audit: [],
  summary: null,
  dive: false,
  quality: 'high',
  reduced: false,
  webgl: true,
  ready: false,
  set: (p) => set(p),
  setLayer: (layer) => set({ layer }),
  selectParcel: (selected) => set({ selected }),
}));

/** Per-frame values that must not trigger React renders. */
export const live = {
  progress: Object.fromEntries(SECTIONS.map((s) => [s, 0])) as Record<SectionId, number>,
  pointer: { x: 0, y: 0 }, // normalised -1..1
  anchors: {
    hover: { x: 0, y: 0, visible: false },
    selected: { x: 0, y: 0, visible: false },
  },
  scanX: -200,
};
