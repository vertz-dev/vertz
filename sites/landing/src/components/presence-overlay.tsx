import { css, keyframes, onMount } from '@vertz/ui';

import {
  advanceSimulation,
  createSimulatedPeers,
  filterByScrollProximity,
  isFaded,
  isIdle,
  selectVisibleCursors,
} from '../presence-logic';
import type { CursorState } from '../presence-types';

// ── Animations ─────────────────────────────────────────────

const cursorEnter = keyframes('cursor-enter', {
  from: { opacity: '0', transform: 'scale(0)' },
  to: { opacity: '1', transform: 'scale(1)' },
});

const pulseExpand = keyframes('pulse-expand', {
  '0%': { opacity: '0.6', transform: 'translate(-50%, -50%) scale(0)' },
  '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(1)' },
});

// ── Styles ─────────────────────────────────────────────────

const s = css({
  overlay: [
    {
      '&': {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '1',
        overflow: 'hidden',
      },
    },
  ],
  cursor: [
    {
      '&': {
        position: 'absolute',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        transition: 'transform 66ms linear, opacity 300ms ease',
        animation: `${cursorEnter} 200ms ease-out`,
        willChange: 'transform, opacity',
      },
    },
  ],
  pulse: [
    {
      '&': {
        position: 'absolute',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        pointerEvents: 'none',
        animation: `${pulseExpand} 800ms ease-out forwards`,
      },
    },
  ],
  optOut: [
    {
      '&': {
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        zIndex: '2',
        background: 'none',
        border: '1px solid #2A2826',
        borderRadius: '6px',
        color: '#6B6560',
        fontSize: '0.65rem',
        fontFamily: 'var(--font-mono)',
        padding: '0.35rem 0.6rem',
        cursor: 'pointer',
        pointerEvents: 'auto',
        transition: 'color 0.15s, border-color 0.15s',
      },
      '&:hover': {
        color: '#9C9690',
        borderColor: '#4A4540',
      },
    },
  ],
});

// ── Constants ──────────────────────────────────────────────

const SIMULATION_PEER_COUNT = 4;
const TICK_INTERVAL_MS = 66; // ~15fps
const STORAGE_KEY = 'vertz-presence-hidden';

// ── Component ──────────────────────────────────────────────

type PulseEffect = {
  id: string;
  x: number;
  y: number;
  color: string;
  createdAt: number;
};

export default function PresenceOverlay() {
  let cursors: CursorState[] = [];
  let pulses: PulseEffect[] = [];
  let localScroll = 0;
  let hidden = false;
  let now = Date.now();

  // All browser side effects are deferred via onMount —
  // this is a no-op during SSR, preventing setInterval from hanging the build.
  onMount(() => {
    hidden = localStorage.getItem(STORAGE_KEY) === 'true';

    const simPeers = createSimulatedPeers(SIMULATION_PEER_COUNT);
    const startTime = Date.now();
    let simState = simPeers;

    // Tick loop — advances simulated cursors and cleans up pulses
    const tickId = setInterval(() => {
      if (hidden) return;
      const elapsed = Date.now() - startTime;
      now = Date.now();
      simState = advanceSimulation(simState, elapsed);
      cursors = simState;
      pulses = pulses.filter((p) => now - p.createdAt < 800);
    }, TICK_INTERVAL_MS);

    // Track scroll position
    function handleScroll() {
      const docEl = document.documentElement;
      if (!docEl) return;
      const docHeight = docEl.scrollHeight;
      localScroll = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // Listen for interaction events (Phase 3 — MiniTodoApp dispatches these)
    function handleInteract() {
      if (hidden || cursors.length === 0) return;
      const peer = cursors[Math.floor(Math.random() * cursors.length)];
      if (!peer) return;
      pulses = [
        ...pulses,
        {
          id: `pulse-${Date.now()}`,
          x: peer.x,
          y: peer.y,
          color: peer.color,
          createdAt: Date.now(),
        },
      ];
    }
    window.addEventListener('vertz:interact', handleInteract);

    // Cleanup on disposal
    return () => {
      clearInterval(tickId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('vertz:interact', handleInteract);
    };
  });

  // ── Toggle handler ─────────────────────────────────────
  function toggleHidden() {
    hidden = !hidden;
    if (hidden) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ── Render ─────────────────────────────────────────────

  const visible = hidden
    ? []
    : selectVisibleCursors(
        filterByScrollProximity(cursors, localScroll),
      );

  return (
    <>
      <div className={s.overlay} aria-hidden="true">
        {visible.map((cursor) => {
          const faded = isFaded(cursor.lastActive, now);
          const idle = isIdle(cursor.lastActive, now);
          if (idle) return null;

          return (
            <div
              key={cursor.id}
              className={s.cursor}
              style={{
                transform: `translate(${cursor.x}vw, ${cursor.y}vh)`,
                background: cursor.color,
                boxShadow: `0 0 8px ${cursor.color}40`,
                opacity: faded ? 0.3 : 0.7,
              }}
            />
          );
        })}

        {!hidden && pulses.map((pulse) => (
          <div
            key={pulse.id}
            className={s.pulse}
            style={{
              left: `${pulse.x}vw`,
              top: `${pulse.y}vh`,
              background: `radial-gradient(circle, ${pulse.color}40 0%, transparent 70%)`,
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className={s.optOut}
        onClick={toggleHidden}
      >
        {hidden ? 'Show cursors' : 'Hide cursors'}
      </button>
    </>
  );
}
