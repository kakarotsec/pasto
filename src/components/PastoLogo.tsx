import type { FC } from "react";

export const PastoLogo: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 240 64"
    role="img"
    aria-label="Pasto logo"
  >
    <defs>
      <linearGradient id="pasto-neon" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(var(--primary))" />
        <stop offset="50%" stopColor="hsl(var(--accent))" />
        <stop offset="100%" stopColor="hsl(var(--primary))" />
      </linearGradient>
      <filter id="pasto-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g filter="url(#pasto-glow)" fill="none" stroke="url(#pasto-neon)" strokeWidth="4.5" strokeLinecap="round">
      <path d="M20 44 V20 H48 Q60 20 60 32 Q60 44 48 44 Z" />
      <path d="M76 44 V20 H104" />
      <path d="M92 20 Q104 20 104 32 Q104 44 92 44 Q80 44 80 32" />
      <path d="M120 44 V20 H144 Q156 20 156 32 Q156 44 144 44 Z" />
      <path d="M172 44 V20 H196" />
      <path d="M180 32 H196" />
      <circle cx="216" cy="32" r="12" />
      <circle cx="216" cy="32" r="5" />
    </g>
  </svg>
);
