import React from 'react';

interface ChakraLogoProps {
  className?: string;
  size?: number | string;
  spin?: boolean;
  glow?: boolean;
  withTitle?: boolean;
  subtitle?: string;
}

export const ChakraLogo: React.FC<ChakraLogoProps> = ({
  className = '',
  size = 36,
  spin = false,
  glow = true,
  withTitle = false,
  subtitle = 'Build Your Own Career'
}) => {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
        {/* Ambient Pulsing Glow */}
        {glow && (
          <div
            className="absolute inset-0 rounded-full blur-md opacity-70 bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-500 animate-pulse pointer-events-none"
            style={{ transform: 'scale(0.85)' }}
          />
        )}

        {/* Vector SVG Representation of Sri Sudarsana Chakra */}
        <svg
          viewBox="0 0 200 200"
          className={`relative z-10 w-full h-full drop-shadow-md ${spin ? 'animate-[spin_12s_linear_infinite]' : ''}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="scGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
            <radialGradient id="scCenterGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#4f46e5" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Central Radiance Zone */}
          <circle cx="100" cy="100" r="85" fill="url(#scCenterGlow)" />

          {/* 16 Serrated Sudarsana Nodes / Blades */}
          <g transform="translate(100 100)" stroke="url(#scGradient)" strokeWidth="1.6" strokeLinecap="round">
            {[...Array(16)].map((_, i) => {
              const deg = i * 22.5;
              return (
                <path
                  key={i}
                  d="M 0 -92 L 10 -76 L 3 -70 Z"
                  transform={`rotate(${deg})`}
                  fill="url(#scGradient)"
                  fillOpacity="0.85"
                />
              );
            })}
          </g>

          {/* Precision Concentric Outer Rings */}
          <circle cx="100" cy="100" r="70" stroke="#38bdf8" strokeWidth="1.2" strokeOpacity="0.8" strokeDasharray="3 4" />
          <circle cx="100" cy="100" r="62" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.9" />

          {/* Concentric Cardinal Nodes */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const x = 100 + 62 * Math.sin(rad);
            const y = 100 - 62 * Math.cos(rad);
            return <circle key={i} cx={x} cy={y} r="2.2" fill="#38bdf8" />;
          })}

          {/* Sacred Shatkona (Overlapping Hexagonal Lattice) */}
          <g transform="translate(100 100)">
            <polygon
              points="0,-48 41.5,24 -41.5,24"
              stroke="#6366f1"
              strokeWidth="1.8"
              strokeLinejoin="round"
              fill="rgba(99, 102, 241, 0.08)"
            />
            <polygon
              points="0,48 41.5,-24 -41.5,-24"
              stroke="#a855f7"
              strokeWidth="1.8"
              strokeLinejoin="round"
              fill="rgba(168, 85, 247, 0.08)"
            />
          </g>

          {/* Inner Glowing Dynamic Ring */}
          <circle cx="100" cy="100" r="28" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="6 3" />
          <circle cx="100" cy="100" r="16" stroke="#c084fc" strokeWidth="1.5" />

          {/* Center Bindu Diamond Core */}
          <polygon points="100,90 110,100 100,110 90,100" fill="url(#scGradient)" />
          <circle cx="100" cy="100" r="3.5" fill="#ffffff" />
        </svg>
      </div>

      {withTitle && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-white text-base leading-none font-mono">
              BYOC
            </span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              v2.0
            </span>
          </div>
          {subtitle && (
            <span className="text-[11px] text-slate-400 font-medium tracking-wide">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
