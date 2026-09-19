import { useStore, live, type SectionId } from '../lib/store';
import { world, hero } from '../lib/dataset';
import { TODAY } from '../lib/world';
import type { ModeLayer } from './layerTargets';

export interface WorldMode {
  layer: ModeLayer;
  day: number;
  focus: number; // parcel idx emphasised (-1 none)
  focusDim: number; // how much the rest dims
  focusLift: number;
  interactive: boolean;
  scan: boolean;
  worldDim: number; // global brightness
  showBuildings: boolean;
}

export const JOURNEY_STEPS = 6;
export const journeyStep = (p: number) => Math.min(JOURNEY_STEPS - 1, Math.floor(p * JOURNEY_STEPS * 0.999));

const INTERACTIVE: SectionId[] = ['hero', 'command', 'return'];

export function resolveMode(): WorldMode {
  const s = useStore.getState();
  const sec = s.active;
  const p = live.progress[sec] ?? 0;
  const focusIdx = world.byId.get(s.focusId)?.idx ?? hero.idx;
  const m: WorldMode = {
    layer: 'overview',
    day: TODAY,
    focus: -1,
    focusDim: 0,
    focusLift: 0,
    interactive: INTERACTIVE.includes(sec),
    scan: false,
    worldDim: 1,
    showBuildings: true,
  };
  switch (sec) {
    case 'login':
      m.layer = 'overview';
      m.interactive = false;
      break;
    case 'hero':
    case 'return':
      m.layer = sec === 'return' ? 'risk' : 'overview';
      break;
    case 'journey': {
      const step = journeyStep(p);
      m.focus = step >= 1 ? hero.idx : -1;
      m.focusDim = step >= 1 ? 0.55 : 0;
      m.focusLift = step >= 1 ? 0.9 : 0;
      if (step === 5) m.layer = 'construction';
      break;
    }
    case 'chain':
      m.layer = 'ambient';
      m.worldDim = 0.55;
      break;
    case 'signature':
      m.focus = hero.idx;
      m.focusDim = 0.62;
      m.worldDim = 0.8;
      break;
    case 'bottleneck':
      m.layer = 'risk';
      m.scan = true;
      break;
    case 'xai':
    case 'officer':
      m.focus = focusIdx;
      m.focusDim = 0.62;
      m.focusLift = 0.8;
      m.layer = 'risk';
      m.worldDim = 0.85;
      break;
    case 'command':
      m.layer = s.layer;
      break;
    case 'timeline':
      m.layer = 'stage';
      m.day = s.day;
      break;
    case 'district':
    case 'finale':
      m.layer = 'risk';
      if (p < (sec === 'district' ? 0.25 : 0.2)) {
        m.focus = hero.idx;
        m.focusDim = 0.5;
        m.focusLift = 0.6;
      }
      break;
    case 'ai':
    case 'causes':
    case 'live':
    case 'capabilities':
    case 'layers':
    case 'architecture':
    case 'ecosystem':
    case 'limits':
    case 'security':
      m.layer = 'ambient';
      m.worldDim = sec === 'layers' ? 0.45 : 0.3;
      break;
  }
  return m;
}
