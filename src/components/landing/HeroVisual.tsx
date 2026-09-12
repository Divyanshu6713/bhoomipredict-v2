/**
 * Hero illustration: an abstract corridor passing through a grid of land
 * parcels. Motion is limited to slow dash-flow along the alignment and a few
 * staggered node pulses — enough to signal "live system" without distracting
 * from the copy.
 */
export function HeroVisual() {
  const parcels = [
    { x: 40, y: 210, w: 78, h: 58, risk: 'low' },
    { x: 124, y: 210, w: 62, h: 58, risk: 'low' },
    { x: 192, y: 196, w: 88, h: 72, risk: 'med' },
    { x: 286, y: 204, w: 70, h: 64, risk: 'low' },
    { x: 362, y: 188, w: 84, h: 80, risk: 'high' },
    { x: 452, y: 200, w: 66, h: 68, risk: 'med' },
    { x: 524, y: 210, w: 92, h: 58, risk: 'low' },
    { x: 40, y: 274, w: 66, h: 62, risk: 'med' },
    { x: 112, y: 274, w: 84, h: 62, risk: 'low' },
    { x: 202, y: 274, w: 72, h: 62, risk: 'crit' },
    { x: 280, y: 274, w: 90, h: 62, risk: 'low' },
    { x: 376, y: 274, w: 68, h: 62, risk: 'med' },
    { x: 450, y: 274, w: 76, h: 62, risk: 'low' },
    { x: 532, y: 274, w: 84, h: 62, risk: 'high' },
  ];

  const colors: Record<string, string> = {
    low: '#10B981',
    med: '#F59E0B',
    high: '#F97316',
    crit: '#E11D48',
  };

  return (
    <svg viewBox="0 0 660 420" className="w-full" aria-hidden="true">
      <defs>
        <linearGradient id="hv-road" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4F8BFF" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#4F8BFF" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#4F8BFF" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="hv-rail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF9933" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#FF9933" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FF9933" stopOpacity="0.1" />
        </linearGradient>
        <filter id="hv-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* survey grid */}
      <g opacity="0.14">
        {Array.from({ length: 15 }).map((_, i) => (
          <line key={`v${i}`} x1={30 + i * 44} y1="30" x2={30 + i * 44} y2="390" stroke="#8FB4FF" strokeWidth="1" />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`h${i}`} x1="30" y1={30 + i * 45} x2="646" y2={30 + i * 45} stroke="#8FB4FF" strokeWidth="1" />
        ))}
      </g>

      {/* land parcels */}
      <g>
        {parcels.map((p, i) => (
          <g key={i} style={{ animation: `fade-in .8s ease ${0.2 + i * 0.06}s both` }}>
            <rect
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              rx="4"
              fill={colors[p.risk]}
              fillOpacity="0.13"
              stroke={colors[p.risk]}
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />
            <line
              x1={p.x + 6}
              y1={p.y + p.h - 8}
              x2={p.x + p.w - 6}
              y2={p.y + p.h - 8}
              stroke={colors[p.risk]}
              strokeOpacity="0.3"
              strokeWidth="1"
            />
          </g>
        ))}
      </g>

      {/* railway alignment */}
      <g>
        <path d="M10 150 C 140 118, 260 176, 380 142 S 560 96, 650 128" fill="none" stroke="url(#hv-rail)" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M10 150 C 140 118, 260 176, 380 142 S 560 96, 650 128"
          fill="none"
          stroke="#FF9933"
          strokeWidth="2"
          strokeDasharray="7 11"
          className="animate-dash-flow"
          opacity="0.8"
        />
      </g>

      {/* expressway alignment */}
      <g>
        <path
          d="M10 322 C 120 300, 210 246, 330 250 S 520 300, 650 258"
          fill="none"
          stroke="url(#hv-road)"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M10 322 C 120 300, 210 246, 330 250 S 520 300, 650 258"
          fill="none"
          stroke="#CFE0FF"
          strokeWidth="1.6"
          strokeDasharray="16 20"
          className="animate-dash-flow"
          opacity="0.55"
        />
      </g>

      {/* monitoring nodes */}
      {[
        { x: 198, y: 268, c: '#F59E0B', d: '0s' },
        { x: 398, y: 228, c: '#E11D48', d: '.8s' },
        { x: 545, y: 268, c: '#10B981', d: '1.6s' },
        { x: 300, y: 148, c: '#4F8BFF', d: '2.2s' },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="6" fill={n.c} opacity="0.25" className="animate-pulse-ring" style={{ animationDelay: n.d, transformOrigin: `${n.x}px ${n.y}px` }} />
          <circle cx={n.x} cy={n.y} r="4.5" fill={n.c} filter="url(#hv-glow)" />
          <circle cx={n.x} cy={n.y} r="1.8" fill="#fff" opacity="0.9" />
        </g>
      ))}

      {/* floating risk readout */}
      <g style={{ animation: 'fade-up .7s cubic-bezier(.22,1,.36,1) .9s both' }}>
        <rect x="396" y="58" width="214" height="82" rx="12" fill="rgba(8,17,35,0.82)" stroke="rgba(120,160,255,0.28)" />
        <text x="414" y="82" fill="rgba(200,218,255,0.6)" fontSize="10" fontWeight="700" letterSpacing="1.1">
          PREDICTED DELAY
        </text>
        <text x="414" y="114" fill="#fff" fontSize="28" fontWeight="800">
          42
        </text>
        <text x="452" y="114" fill="rgba(200,218,255,0.65)" fontSize="12" fontWeight="600">
          days
        </text>
        <rect x="512" y="92" width="80" height="24" rx="12" fill="rgba(225,29,72,0.18)" stroke="rgba(225,29,72,0.5)" />
        <text x="552" y="108" fill="#FB7185" fontSize="11" fontWeight="800" textAnchor="middle">
          HIGH RISK
        </text>
        <rect x="414" y="126" width="178" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <rect x="414" y="126" width="152" height="4" rx="2" fill="#E11D48" opacity="0.85" />
      </g>

      {/* confidence readout */}
      <g style={{ animation: 'fade-up .7s cubic-bezier(.22,1,.36,1) 1.25s both' }}>
        <rect x="34" y="72" width="160" height="62" rx="12" fill="rgba(8,17,35,0.72)" stroke="rgba(120,160,255,0.22)" />
        <text x="50" y="94" fill="rgba(200,218,255,0.6)" fontSize="9.5" fontWeight="700" letterSpacing="1.1">
          MODEL CONFIDENCE
        </text>
        <text x="50" y="120" fill="#7BE7C7" fontSize="21" fontWeight="800">
          87%
        </text>
        <circle cx="166" cy="110" r="12" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5" />
        <circle
          cx="166"
          cy="110"
          r="12"
          fill="none"
          stroke="#34D399"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="65 75"
          transform="rotate(-90 166 110)"
        />
      </g>
    </svg>
  );
}
