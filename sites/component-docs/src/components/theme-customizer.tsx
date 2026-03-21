import type { PaletteName } from '@vertz/theme-shadcn';
import { palettes } from '@vertz/theme-shadcn';
import type { AccentName } from '../hooks/use-customization';
import {
  ACCENT_PRESETS,
  applyAccent,
  applyPalette,
  applyRadius,
  clearCustomizationCookie,
  clearOverrides,
  generateConfig,
  getCustomizationCookie,
  setCustomizationCookie,
  setModuleState,
} from '../hooks/use-customization';

const NEUTRAL_OPTIONS: { name: PaletteName; label: string; swatch: string }[] = [
  { name: 'zinc', label: 'Zinc', swatch: palettes.zinc.foreground.DEFAULT },
  { name: 'slate', label: 'Slate', swatch: palettes.slate.foreground.DEFAULT },
  { name: 'stone', label: 'Stone', swatch: palettes.stone.foreground.DEFAULT },
  { name: 'neutral', label: 'Neutral', swatch: palettes.neutral.foreground.DEFAULT },
  { name: 'gray', label: 'Gray', swatch: palettes.gray.foreground.DEFAULT },
];

const RADIUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: '0' },
  { value: 'xs', label: '0.125' },
  { value: 'sm', label: '0.25' },
  { value: 'md', label: '0.375' },
  { value: 'lg', label: '0.625' },
  { value: 'xl', label: '1.0' },
  { value: '2xl', label: '1.5' },
];

const ACCENT_OPTIONS: { name: AccentName; label: string }[] = [
  { name: 'default', label: 'Default' },
  { name: 'red', label: 'Red' },
  { name: 'orange', label: 'Orange' },
  { name: 'amber', label: 'Amber' },
  { name: 'yellow', label: 'Yellow' },
  { name: 'lime', label: 'Lime' },
  { name: 'green', label: 'Green' },
  { name: 'emerald', label: 'Emerald' },
  { name: 'teal', label: 'Teal' },
  { name: 'cyan', label: 'Cyan' },
  { name: 'sky', label: 'Sky' },
  { name: 'blue', label: 'Blue' },
  { name: 'indigo', label: 'Indigo' },
  { name: 'violet', label: 'Violet' },
  { name: 'purple', label: 'Purple' },
  { name: 'fuchsia', label: 'Fuchsia' },
  { name: 'pink', label: 'Pink' },
  { name: 'rose', label: 'Rose' },
];

function getCurrentMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return (
    (document.querySelector('div[data-theme]')?.getAttribute('data-theme') as 'dark' | 'light') ??
    'dark'
  );
}

export function ThemeCustomizer() {
  let isOpen = false;
  let copied = false;

  // Local reactive state — compiler transforms `let` to signals
  const saved = getCustomizationCookie();
  let selectedPalette: PaletteName = saved?.palette ?? 'zinc';
  let selectedRadius: string = saved?.radius ?? 'md';
  let selectedAccent: AccentName = saved?.accent ?? 'default';

  // Sync module-level state for theme toggle
  setModuleState({ palette: selectedPalette, radius: selectedRadius, accent: selectedAccent });

  function persistAndSync() {
    const state = { palette: selectedPalette, radius: selectedRadius, accent: selectedAccent };
    setModuleState(state);
    if (state.palette === 'zinc' && state.radius === 'md' && state.accent === 'default') {
      clearCustomizationCookie();
    } else {
      setCustomizationCookie(state);
    }
  }

  function handlePalette(p: PaletteName) {
    selectedPalette = p;
    const mode = getCurrentMode();
    if (p === 'zinc') {
      // Clear overrides from both div[data-theme] and <html>
      const target = document.querySelector('div[data-theme]') as HTMLElement | null;
      if (target) {
        for (const name of Object.keys(palettes.zinc)) {
          target.style.removeProperty(`--color-${name}`);
        }
      }
      for (const name of Object.keys(palettes.zinc)) {
        document.documentElement.style.removeProperty(`--color-${name}`);
      }
    } else {
      applyPalette(p, mode);
    }
    // Re-apply accent after palette (accent overrides primary/ring)
    if (selectedAccent !== 'default') {
      applyAccent(selectedAccent, mode);
    }
    persistAndSync();
  }

  function handleRadius(r: string) {
    selectedRadius = r;
    if (r === 'md') {
      const target = document.querySelector('div[data-theme]') as HTMLElement | null;
      target?.style.removeProperty('--radius');
      document.documentElement.style.removeProperty('--radius');
    } else {
      applyRadius(r);
    }
    persistAndSync();
  }

  function handleAccent(a: AccentName) {
    selectedAccent = a;
    applyAccent(a, getCurrentMode());
    persistAndSync();
  }

  function handleReset() {
    selectedPalette = 'zinc';
    selectedRadius = 'md';
    selectedAccent = 'default';
    clearOverrides();
    clearCustomizationCookie();
    setModuleState({ palette: 'zinc', radius: 'md', accent: 'default' });
  }

  function handleCopy() {
    const code = generateConfig({
      palette: selectedPalette,
      radius: selectedRadius,
      accent: selectedAccent,
    });
    navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  const isNonDefault =
    selectedPalette !== 'zinc' || selectedRadius !== 'md' || selectedAccent !== 'default';

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          isOpen = !isOpen;
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          backgroundColor: 'transparent',
          color: 'var(--color-foreground)',
          cursor: 'pointer',
        }}
        aria-label="Customize theme"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          <circle cx="7.5" cy="11.5" r="1.5" />
          <circle cx="10.5" cy="7.5" r="1.5" />
          <circle cx="15.5" cy="7.5" r="1.5" />
          <circle cx="17.5" cy="11.5" r="1.5" />
        </svg>
      </button>

      {/* Backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
      <div
        style={{
          display: isOpen ? 'block' : 'none',
          position: 'fixed',
          inset: '0',
          zIndex: '99',
        }}
        onClick={() => {
          isOpen = false;
        }}
      />

      {/* Panel */}
      <div
        style={{
          display: isOpen ? 'flex' : 'none',
          flexDirection: 'column',
          position: 'fixed',
          top: '64px',
          right: '16px',
          width: '320px',
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
          zIndex: '100',
          padding: '20px',
          gap: '20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-foreground)' }}>
            Customize Theme
          </span>
          <button
            type="button"
            onClick={() => {
              isOpen = false;
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              border: 'none',
              background: 'none',
              color: 'var(--color-muted-foreground)',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
            aria-label="Close customizer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Neutral section */}
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '500',
              color: 'var(--color-muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Neutral
          </span>
          <div
            role="radiogroup"
            aria-label="Neutral tones"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '8px',
            }}
          >
            {NEUTRAL_OPTIONS.map((p) => {
              const isSelected = selectedPalette === p.name;
              return (
                // biome-ignore lint/a11y/useSemanticElements: styled button with radio semantics
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected ? 'true' : 'false'}
                  aria-label={p.label}
                  onClick={() => handlePalette(p.name)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border: isSelected
                        ? '2px solid var(--color-foreground)'
                        : '2px solid transparent',
                      padding: '2px',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        backgroundColor: p.swatch,
                        border: '1px solid var(--color-border)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: isSelected
                        ? 'var(--color-foreground)'
                        : 'var(--color-muted-foreground)',
                      fontWeight: isSelected ? '500' : '400',
                    }}
                  >
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent color section */}
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '500',
              color: 'var(--color-muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Accent Color
          </span>
          <div
            role="radiogroup"
            aria-label="Accent color"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            {ACCENT_OPTIONS.map((a) => {
              const isSelected = selectedAccent === a.name;
              const swatch =
                a.name === 'default'
                  ? 'var(--color-muted-foreground)'
                  : ACCENT_PRESETS[a.name].swatch;
              return (
                // biome-ignore lint/a11y/useSemanticElements: styled button with radio semantics
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected ? 'true' : 'false'}
                  aria-label={a.label}
                  onClick={() => handleAccent(a.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: isSelected
                      ? '2px solid var(--color-foreground)'
                      : '2px solid transparent',
                    padding: '2px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      backgroundColor: swatch,
                      border: '1px solid var(--color-border)',
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Radius section */}
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '500',
              color: 'var(--color-muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Border Radius
          </span>
          <div
            role="radiogroup"
            aria-label="Border radius"
            style={{ display: 'flex', gap: '6px', marginTop: '8px' }}
          >
            {RADIUS_OPTIONS.map((r) => {
              const isSelected = selectedRadius === r.value;
              return (
                // biome-ignore lint/a11y/useSemanticElements: styled button with radio semantics
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected ? 'true' : 'false'}
                  onClick={() => handleRadius(r.value)}
                  style={{
                    flex: '1',
                    padding: '6px 0',
                    fontSize: '13px',
                    fontWeight: isSelected ? '500' : '400',
                    color: isSelected ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                    border: isSelected
                      ? '2px solid var(--color-primary)'
                      : '2px solid var(--color-border)',
                    borderRadius: '6px',
                    backgroundColor: isSelected ? 'var(--color-accent)' : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Config export */}
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '500',
              color: 'var(--color-muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Configuration
          </span>
          <div
            style={{
              marginTop: '8px',
              position: 'relative',
              backgroundColor: 'var(--color-muted)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <pre
              style={{
                margin: '0',
                padding: '12px',
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-mono, monospace)',
                overflowX: 'auto',
                whiteSpace: 'pre',
              }}
            >
              {generateConfig({
                palette: selectedPalette,
                radius: selectedRadius,
                accent: selectedAccent,
              })}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                color: 'var(--color-muted-foreground)',
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Reset button */}
        {isNonDefault && (
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: '8px',
              fontSize: '13px',
              color: 'var(--color-muted-foreground)',
              backgroundColor: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reset to defaults
          </button>
        )}
      </div>
    </>
  );
}
