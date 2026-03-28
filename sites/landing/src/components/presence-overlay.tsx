import { onMount } from '@vertz/ui';

import {
  advanceSimulation,
  createSimulatedPeers,
} from '../presence-logic';
import type { CursorState } from '../presence-types';

// ── Constants ──────────────────────────────────────────────

const SIMULATION_PEER_COUNT = 4;
const TICK_INTERVAL_MS = 66; // ~15fps
const STORAGE_KEY = 'vertz-presence-hidden';

/** Fake names shown on cursor labels */
const PEER_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey'];

// ── Figma-style cursor SVG ─────────────────────────────────

function CursorArrow({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="22"
      viewBox="0 0 16 22"
      fill="none"
      style={{ display: 'block' }}
    >
      <path
        d="M0.928711 0.414062L15.2287 11.4141L8.42871 12.4141L4.42871 20.9141L0.928711 0.414062Z"
        fill={color}
      />
      <path
        d="M0.928711 0.414062L15.2287 11.4141L8.42871 12.4141L4.42871 20.9141L0.928711 0.414062Z"
        stroke="rgba(0,0,0,0.3)"
        stroke-width="0.6"
      />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────

export default function PresenceOverlay() {
  let cursors: CursorState[] = [];
  let hidden = false;

  onMount(() => {
    hidden = localStorage.getItem(STORAGE_KEY) === 'true';

    const simPeers = createSimulatedPeers(SIMULATION_PEER_COUNT);
    const startTime = Date.now();
    let simState = simPeers;

    const tickId = setInterval(() => {
      if (hidden) return;
      const elapsed = Date.now() - startTime;
      simState = advanceSimulation(simState, elapsed);
      cursors = simState;
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(tickId);
    };
  });

  function toggleHidden() {
    hidden = !hidden;
    if (hidden) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ── Render ─────────────────────────────────────────────

  const visible = hidden ? [] : cursors;

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: '0',
          pointerEvents: 'none',
          zIndex: '1',
          overflow: 'hidden',
        }}
      >
        {visible.map((cursor) => (
          <div
            key={cursor.id}
            style={{
              position: 'absolute',
              willChange: 'transform',
              transform: `translate(${cursor.x}vw, ${cursor.y}vh)`,
              transition: 'transform 66ms linear',
              opacity: '0.6',
            }}
          >
            <CursorArrow color={cursor.color} />
            <div
              style={{
                marginTop: '-2px',
                marginLeft: '10px',
                background: cursor.color,
                color: '#fff',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: '500',
                padding: '1px 5px 2px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                lineHeight: '1.3',
              }}
            >
              {PEER_NAMES[Number(cursor.id.replace('sim-', ''))] ?? 'User'}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleHidden}
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: '40',
          background: 'none',
          border: '1px solid #2A2826',
          borderRadius: '6px',
          color: '#6B6560',
          fontSize: '0.65rem',
          fontFamily: 'var(--font-mono)',
          padding: '0.35rem 0.6rem',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        {hidden ? 'Show cursors' : 'Hide cursors'}
      </button>
    </>
  );
}
