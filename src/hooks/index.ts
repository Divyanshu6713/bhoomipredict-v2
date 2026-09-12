import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Animated counter driven by requestAnimationFrame with an ease-out curve. */
export function useCountUp(target: number, duration = 1200, decimals = 0, start = true) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>();

  useEffect(() => {
    if (!start) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Number((from + (target - from) * eased).toFixed(decimals)));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    // Browsers pause rAF in background tabs. Without this the counter would be
    // left frozen mid-count when the user switches away and back, so settle on
    // the true value once the animation window has elapsed regardless.
    const settle = window.setTimeout(() => setValue(target), duration + 120);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      clearTimeout(settle);
    };
  }, [target, duration, decimals, start]);

  return value;
}

/** Fires once when the element scrolls into the viewport. */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Elements already on screen at mount are treated as visible immediately.
    // IntersectionObserver callbacks are deferred and can be suppressed entirely
    // while a tab is not compositing, which would otherwise leave above-the-fold
    // counters and reveals stuck in their initial state.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setInView(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** True while refetching with data already on screen — keeps tables stable. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Fetch helper for the API. Aborts the in-flight request when dependencies
 * change, keeps the previous payload visible while refetching, and exposes a
 * manual reload.
 */
export function useApi<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    if (hasData.current) setRefreshing(true);
    else setLoading(true);

    fn(controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
        hasData.current = true;
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err as Error);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, refreshing, reload };
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('bp-theme') : null;
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('bp-theme', theme);
    } catch {
      /* storage unavailable — theme simply does not persist */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useOnClickOutside<T extends HTMLElement>(handler: () => void) {
  const ref = useRef<T>(null);
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) saved.current();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);
  return ref;
}

/**
 * Filter state kept in the URL, so a filtered view is shareable and the back
 * button behaves. Values equal to their default are dropped from the query.
 */
export function useFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const v = params.get(String(key));
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [params, defaults]);

  const set = useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === defaults[key as keyof T]) next.delete(key);
        else next.set(key, String(value));
      }
      // Any filter change invalidates the current page.
      if (!Object.prototype.hasOwnProperty.call(patch, 'page')) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams, defaults],
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const activeCount = useMemo(
    () =>
      (Object.keys(defaults) as Array<keyof T>).filter(
        (k) => k !== 'page' && k !== 'sort' && k !== 'pageSize' && values[k] !== defaults[k],
      ).length,
    [values, defaults],
  );

  return { values, set, reset, activeCount };
}
