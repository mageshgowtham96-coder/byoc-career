/**
 * BYOC Semantic Design Token System
 * Primary direction: Obsidian Telemetry + Aether Tactical HUD
 *
 * Color tokens map to:
 *  - Dark obsidian / navy surfaces
 *  - Electric cyan primary illumination
 *  - Indigo / violet accents
 *  - Emerald verified/success
 *  - Amber warning / skill-gap
 *
 * Type scale: Space Grotesk / Plus Jakarta Sans
 * Mono: JetBrains Mono for telemetry
 */

export const DESIGN_TOKENS = {
  // SURFACE TOKENS
  colors: {
    // Deep obsidian / navy base
    obsidian: '#070B14',
    navy: '#0F172A',

    // Primary illumination
    cyan: '#06B6D4',
    sky: '#38BDF8',
    indigo: '#6366F1',
    violet: '#8B5CF6',

    // Accent tokens
    violet_light: '#A78BFA',
    cyan_light: '#67E8F9',

    // Verified success
    emerald: '#10B981',
    emerald_light: '#D1F2E8',
    emerald_dark: '#059669',

    // Warning / skill gap
    amber: '#F59E0B',
    amber_light: '#FEF3C7',
    amber_dark: '#B45309',

    // Status neutrals (tailwind 800-50 compatible with #070B14 base)
    slate_50: '#F8FAFC',
    slate_100: '#F1F5F9',
    slate_800: '#1E293B',
    slate_900: '#0F172A',
    slate_950: '#070B14',

    // Feedback states
    rose_50: '#FFF1F2',
    rose_500: '#EC4899',
    rose_600: '#DB2777',
    teal_500: '#14B8A6',
    amber_500: '#F59E0B',
  },

  // TYPOGRAPHY
  fontFamily: {
    // Display / headings: Space Grotesk (if available via CSS import)
    display: `'Space Grotesk', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`,
    // Body / readable content
    body: `'Plus Jakarta Sans', 'Space Grotesk', system-ui, -apple-system, sans-serif`,
    // Telemetry / numeric data
    mono: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`,
  },

  // SPACING SCALE (rem)
  spacing: {
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.5rem',    // 24px
    6: '2rem',      // 32px
    8: '3rem',      // 48px
    10: '4rem',     // 64px
  },

  // BORDER RADIUS
  radius: {
    sm: '0.125rem',   // 2px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    2xl: '1rem',      // 16px
    full: '9999px',
  },

  // SHADOW TOKENS
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    glass: '0 4px 24px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',
    // Frosted glass for panels
    frost: '0 4px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },

  // Z-INDEX
  zIndex: {
    base: '0',
    header: '10',
    modal: '100',
    drawer: '200',
    tooltip: '300',
    overlay: '400',
  },
}

// Export CSS custom properties for index.css integration
export const DESIGN_TOKEN_CSS = `
:root {
  --obsidian: ${DESIGN_TOKENS.colors.obsidian};
  --navy: ${DESIGN_TOKENS.colors.navy};
  --cyan: ${DESIGN_TOKENS.colors.cyan};
  --sky: ${DESIGN_TOKENS.colors.sky};
  --indigo: ${DESIGN_TOKENS.colors.indigo};
  --violet: ${DESIGN_TOKENS.colors.violet};
  --emerald: ${DESIGN_TOKENS.colors.emerald};
  --emerald-light: ${DESIGN_TOKENS.colors.emerald_light};
  --amber: ${DESIGN_TOKENS.colors.amber};
  --amber-light: ${DESIGN_TOKENS.colors.amber_light};
  --slate-50: ${DESIGN_TOKENS.colors.slate_50};
  --slate-100: ${DESIGN_TOKENS.colors.slate_100};
  --slate-800: ${DESIGN_TOKENS.colors.slate_800};
  --slate-900: ${DESIGN_TOKENS.colors.slate_900};
  --slate-950: ${DESIGN_TOKENS.colors.slate_950};
  --rose-50: ${DESIGN_TOKENS.colors.rose_50};
  --rose-600: ${DESIGN_TOKENS.colors.rose_600};
  --font-display: ${DESIGN_TOKENS.fontFamily.display};
  --font-body: ${DESIGN_TOKENS.fontFamily.body};
  --font-mono: ${DESIGN_TOKENS.fontFamily.mono};
  --spacing-1: ${DESIGN_TOKENS.spacing[1]};
  --spacing-2: ${DESIGN_TOKENS.spacing[2]};
  --spacing-3: ${DESIGN_TOKENS.spacing[3]};
  --spacing-4: ${DESIGN_TOKENS.spacing[4]};
  --spacing-5: ${DESIGN_TOKENS.spacing[5]};
  --radius-sm: ${DESIGN_TOKENS.radius.sm};
  --radius-md: ${DESIGN_TOKENS.radius.md};
  --radius-lg: ${DESIGN_TOKENS.radius.lg};
  --radius-xl: ${DESIGN_TOKENS.radius.xl};
  --shadow-sm: ${DESIGN_TOKENS.shadows.sm};
  --shadow-md: ${DESIGN_TOKENS.shadows.md};
  --shadow-lg: ${DESIGN_TOKENS.shadows.lg};
  --shadow-frost: ${DESIGN_TOKENS.shadows.frost};
  --z-base: ${DESIGN_TOKENS.zIndex.base};
  --z-header: ${DESIGN_TOKENS.zIndex.header};
  --z-modal: ${DESIGN_TOKENS.zIndex.modal};
}
`