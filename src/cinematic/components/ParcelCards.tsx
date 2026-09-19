import { useEffect, useRef } from 'react';
import { useStore, live } from '../lib/store';
import { parcelInfo } from '../lib/parcelInfo';
import { pct, riskColor } from '../lib/palette';
import { scrollToId } from '../lib/scroll';

const CARD_W = 272;

/** Floating card that follows a hovered parcel, joined to it by a thin connector line. */
export function HoverCard() {
  const hovered = useStore((s) => s.hovered);
  const active = useStore((s) => s.active);
  const selected = useStore((s) => s.selected);
  const show = hovered >= 0 && hovered !== selected && ['hero', 'command', 'return'].includes(active);
  const card = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const loop = () => {
      const a = live.anchors.hover;
      const el = card.current;
      if (el && line.current && dot.current) {
        const h = el.offsetHeight;
        const right = a.x + 60 + CARD_W < window.innerWidth - 16;
        const x = right ? a.x + 60 : a.x - 60 - CARD_W;
        const y = Math.min(window.innerHeight - h - 16, Math.max(80, a.y - h - 40));
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        el.style.opacity = a.visible ? '1' : '0';
        const ex = right ? x : x + CARD_W;
        const ey = y + h - 18;
        line.current.setAttribute('x1', String(a.x));
        line.current.setAttribute('y1', String(a.y));
        line.current.setAttribute('x2', String(ex));
        line.current.setAttribute('y2', String(ey));
        dot.current.setAttribute('cx', String(a.x));
        dot.current.setAttribute('cy', String(a.y));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [show, hovered]);

  if (!show) return null;
  const info = parcelInfo(hovered);
  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-live="polite">
      <svg className="absolute inset-0 h-full w-full">
        <line ref={line} stroke="rgba(159,211,223,0.6)" strokeWidth="1" />
        <circle ref={dot} r="3.5" fill="#e3eaee" />
      </svg>
      <div ref={card} className="panel absolute left-0 top-0 p-4 shadow-2xl" style={{ width: CARD_W }}>
        <ParcelBody info={info} />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Click to inspect</p>
      </div>
    </div>
  );
}

export function ParcelBody({ info, compact = false }: { info: ReturnType<typeof parcelInfo>; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-grotesk text-lg font-semibold text-mist-50">Parcel {info.id}</span>
        {info.risk != null && (
          <span className="font-grotesk text-2xl font-semibold" style={{ color: riskColor(info.risk) }}>
            {pct(info.risk)}
          </span>
        )}
      </div>
      <div className="mt-2">
        <div className="kv">
          <span>Stage</span>
          <span>{info.inScope ? info.phase : 'Not in acquisition scope'}</span>
        </div>
        {info.risk != null && (
          <div className="kv">
            <span>Risk</span>
            <span>
              {pct(info.risk)} · {info.band}
            </span>
          </div>
        )}
        {!compact && (
          <div className="kv">
            <span>Area</span>
            <span>
              {info.area} · {info.village}
            </span>
          </div>
        )}
        {!info.inScope && (
          <div className="kv">
            <span>Land use</span>
            <span>{info.landUse}</span>
          </div>
        )}
      </div>
      {info.contributors.length > 0 && (
        <div className="mt-3">
          <p className="cine-eyebrow !text-[10px] !text-mist-400">Top contributors</p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-mist-100">
            {info.contributors.map((c) => (
              <li key={c.key} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-risk-med" />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {info.next && !compact && (
        <p className="mt-3 text-[12.5px] text-mist-300">
          <span className="text-gis-400">Next check · </span>
          {info.next}
        </p>
      )}
    </div>
  );
}

/** Pinned details for a clicked parcel in the hero / return views. */
export function SelectedCard() {
  const selected = useStore((s) => s.selected);
  const active = useStore((s) => s.active);
  const set = useStore((s) => s.set);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ selected: -1 });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);
  if (selected < 0 || !['hero', 'return'].includes(active)) return null;
  const info = parcelInfo(selected);
  return (
    <div className="pe fixed right-4 top-24 z-40 w-[300px] max-w-[calc(100vw-32px)] md:right-10">
      <div className="panel p-5 shadow-2xl fx-in" role="dialog" aria-label={`Parcel ${info.id} details`}>
        <ParcelBody info={info} />
        <div className="mt-4 flex gap-2">
          {info.risk != null && (
            <button
              className="btn btn-primary !px-4 !py-2.5 !text-[11px]"
              data-cursor="explain"
              onClick={() => {
                set({ focusId: info.id, whatIf: {} });
                scrollToId('xai');
              }}
            >
              Explain risk
            </button>
          )}
          <button className="btn btn-ghost !px-4 !py-2.5 !text-[11px]" onClick={() => set({ selected: -1 })}>
            Close
          </button>
        </div>
        <p className="mt-3 text-[11px] text-mist-500">Esc to return · synthetic parcel</p>
      </div>
    </div>
  );
}
