/** @type {import('tailwindcss').Config} */
const withOpacity = (v) => ({ opacityValue }) =>
  opacityValue === undefined ? `rgb(var(${v}))` : `rgb(var(${v}) / ${opacityValue})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: withOpacity('--c-bg'),
        surface: withOpacity('--c-surface'),
        'surface-2': withOpacity('--c-surface-2'),
        'surface-3': withOpacity('--c-surface-3'),
        line: withOpacity('--c-line'),
        'line-strong': withOpacity('--c-line-strong'),
        ink: withOpacity('--c-ink'),
        'ink-2': withOpacity('--c-ink-2'),
        'ink-3': withOpacity('--c-ink-3'),
        brand: {
          DEFAULT: withOpacity('--c-brand'),
          soft: withOpacity('--c-brand-soft'),
          ink: withOpacity('--c-brand-ink'),
        },
        navy: {
          950: '#050A16',
          900: '#081123',
          850: '#0B1730',
          800: '#0F1E3D',
          750: '#14294F',
          700: '#193260',
          600: '#22447F',
          500: '#2E5AA6',
        },
        risk: {
          low: '#10B981',
          medium: '#F59E0B',
          high: '#F97316',
          critical: '#E11D48',
        },
        accent: {
          teal: '#0EA5A4',
          violet: '#7C6CF5',
          saffron: '#FF9933',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(8,17,35,0.04), 0 8px 24px -12px rgba(8,17,35,0.16)',
        'card-hover': '0 2px 6px rgba(8,17,35,0.06), 0 18px 40px -18px rgba(8,17,35,0.28)',
        pop: '0 24px 60px -24px rgba(8,17,35,0.45)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'slide-in-right': { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'dash-flow': { '0%': { strokeDashoffset: '0' }, '100%': { strokeDashoffset: '-240' } },
        'pulse-ring': { '0%': { transform: 'scale(.9)', opacity: '.7' }, '70%': { transform: 'scale(1.6)', opacity: '0' }, '100%': { opacity: '0' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        'grow-bar': { '0%': { width: '0%' }, '100%': { width: 'var(--bar-w)' } },
        sweep: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(300%)' } },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .4s ease both',
        'scale-in': 'scale-in .35s cubic-bezier(.22,1,.36,1) both',
        'slide-in-right': 'slide-in-right .35s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'dash-flow': 'dash-flow 6s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(.24,.6,.35,1) infinite',
        float: 'float 7s ease-in-out infinite',
        'grow-bar': 'grow-bar 1s cubic-bezier(.22,1,.36,1) both',
        sweep: 'sweep 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
