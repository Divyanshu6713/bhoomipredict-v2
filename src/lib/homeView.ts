/**
 * LandPulse has two homepages for one product: the standard page and the
 * immersive 3D experience at "/experience". The view a visitor last chose is
 * remembered, so "/" (and "home" links such as the logo on sign-in) open it —
 * e.g. a presenter clicks "Explore in 3D" once and the 3D view stays in front
 * until they pick "Standard View".
 *
 *   /?view=3d        — switch this browser to the 3D view
 *   /?view=standard  — switch back to the standard view
 *   VITE_HOME_VIEW=3d — make 3D the default for first-time visitors (build/dev env)
 */
export const STANDARD_HOME = '/';
export const EXPERIENCE_HOME = '/experience';

type HomePath = typeof STANDARD_HOME | typeof EXPERIENCE_HOME;

const KEY = 'lp-home';
const DEFAULT_HOME: HomePath = import.meta.env.VITE_HOME_VIEW === '3d' ? EXPERIENCE_HOME : STANDARD_HOME;

export function rememberHome(path: HomePath) {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable: the default view is used */
  }
}

export function homePath(): HomePath {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === EXPERIENCE_HOME || saved === STANDARD_HOME ? saved : DEFAULT_HOME;
  } catch {
    return DEFAULT_HOME;
  }
}

/** Apply a `?view=3d|standard` switch from the URL, if present. */
export function applyViewParam(search: string) {
  const view = new URLSearchParams(search).get('view');
  if (view === '3d') rememberHome(EXPERIENCE_HOME);
  else if (view === 'standard') rememberHome(STANDARD_HOME);
}

/** Start downloading the 3D experience before the visitor commits to it. */
export function preloadExperience() {
  void import('@/cinematic/CinematicLanding');
}
