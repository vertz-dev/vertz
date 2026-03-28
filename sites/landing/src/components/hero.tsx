import { css, Island, keyframes, onMount } from '@vertz/ui';
import { ComposedList as List } from '@vertz/ui-primitives';

const listEnter = keyframes('todo-enter', {
  from: { opacity: '0', transform: 'translateY(-0.5rem)' },
  to: { opacity: '1', transform: 'translateY(0)' },
});

const checkBgIn = keyframes('check-bg-in', {
  from: { background: 'transparent', 'border-color': '#4A4540' },
  to: { background: '#C8451B', 'border-color': '#C8451B' },
});

const checkBgOut = keyframes('check-bg-out', {
  from: { background: '#C8451B', 'border-color': '#C8451B' },
  to: { background: 'transparent', 'border-color': '#4A4540' },
});

const checkIconIn = keyframes('check-icon-in', {
  from: { opacity: '0', transform: 'scale(0.5)' },
  to: { opacity: '1', transform: 'scale(1)' },
});

const checkIconOut = keyframes('check-icon-out', {
  from: { opacity: '1', transform: 'scale(1)' },
  to: { opacity: '0', transform: 'scale(0.5)' },
});

const checkStrokeIn = keyframes('check-stroke-in', {
  from: { 'stroke-dashoffset': '30' },
  to: { 'stroke-dashoffset': '0' },
});

const checkStrokeOut = keyframes('check-stroke-out', {
  from: { 'stroke-dashoffset': '0' },
  to: { 'stroke-dashoffset': '30' },
});

import CopyButton from './copy-button';
import { TOKENS_ENTITY, TOKENS_SCHEMA, TOKENS_UI } from './highlighted-code';
import { TokenLines } from './token-lines';

const CODE_TABS = [
  { id: 'ui', label: 'UI', filename: 'TodoList.tsx', tokens: TOKENS_UI },
  { id: 'api', label: 'API', filename: 'todos.entity.ts', tokens: TOKENS_ENTITY },
  { id: 'schema', label: 'Schema', filename: 'schema.ts', tokens: TOKENS_SCHEMA },
] as const;

const s = css({
  section: [
    'flex',
    'items:center',
    'justify:center',
    'px:6',
    'min-h:screen',
    {
      '&': { 'padding-top': '5rem' },
      '@media (min-width: 1024px)': {
        'padding-left': '3rem',
        'padding-right': '3rem',
        'padding-top': '0',
      },
    },
  ],
  grid: [
    'flex',
    'flex-col',
    'gap:12',
    'w:full',
    'max-w:6xl',
    'mx:auto',
    'items:center',
    {
      '@media (min-width: 1024px)': {
        'flex-direction': 'row',
        'align-items': 'center',
        gap: '4rem',
      },
    },
  ],
  textCol: [
    'flex',
    'flex-col',
    'text:center',
    {
      '@media (min-width: 1024px)': {
        'text-align': 'left',
        flex: '1 1 0%',
        'min-width': '0',
      },
    },
  ],
  codeCol: [
    'w:full',
    {
      '@media (min-width: 1024px)': {
        flex: '1 1 0%',
        'min-width': '0',
      },
    },
  ],
  badge: ['flex', 'items:center', 'gap:2', 'mb:6', { '@media (min-width: 1024px)': { 'justify-content': 'flex-start' } }],
  badgeDotWrap: ['relative', 'flex', 'h:2.5', 'w:2.5'],
  badgeDotPing: ['absolute', 'inline-flex', 'h:full', 'w:full', 'rounded:full', 'opacity:40'],
  badgeDot: ['relative', 'inline-flex', 'rounded:full', 'h:2.5', 'w:2.5'],
  badgeText: ['font:xs', 'tracking:widest', 'uppercase', { '&': { color: '#6B6560' } }],
  h1: [],
  h1Line: ['block'],
  h1LineFaded: ['block', { '&': { color: '#6B6560' } }],
  rotatingWrap: [
    'relative',
    {
      '&': {
        display: 'inline-block',
        overflow: 'hidden',
        'vertical-align': 'bottom',
        height: '1.15em',
      },
    },
  ],
  rotatingWord: [
    'block',
    {
      '&': {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
      },
    },
  ],
  rotatingWordActive: [
    'block',
    {
      '&': {
        position: 'relative',
      },
    },
  ],
  description: ['mt:6', 'font:base', 'max-w:xl', 'leading:relaxed', { '&': { color: '#9C9690' } }],
  descriptionHighlight: ['weight:medium', { '&': { color: '#E8E4DC' } }],
  ctas: [
    'mt:10',
    'flex',
    'flex-col',
    'items:stretch',
    'gap:4',
    {
      '@media (min-width: 1024px)': {
        'align-items': 'flex-start',
      },
    },
  ],
  githubLink: [
    'flex',
    'items:center',
    'justify:center',
    'gap:2',
    'py:3',
    'px:6',
    'font:sm',
    'uppercase',
    'tracking:wider',
    'transition:colors',
    { '&': { color: '#6B6560' } },
    {
      '@media (min-width: 640px)': { display: 'inline-flex' },
    },
  ],
  // Code group styles
  codeGroup: [
    'border:1',
    'shadow:2xl',
    { '&': { overflow: 'hidden', 'background-color': '#1C1B1A', 'border-color': '#2A2826', 'border-radius': '2px' } },
  ],
  tabBar: [
    'flex',
    'border-b:1',
    { '&': { 'border-color': '#2A2826' } },
  ],
  tab: [
    'py:2.5',
    'px:4',
    'font:xs',
    'tracking:wide',
    'cursor:pointer',
    'transition:colors',
    'border-b:2',
    {
      '&': {
        background: 'none',
        border: 'none',
        'border-bottom': '2px solid transparent',
        outline: 'none',
      },
    },
  ],
  codeBody: [
    'p:5',
    'font:xs',
    'leading:relaxed',
    { '&': { color: '#D4D0C8' } },
    { '&': { 'overflow-x': 'auto' } },
  ],
  filename: [
    'font:xs',
    'text:gray.500',
    'px:6',
    'pt:4',
    'pb:0',
  ],
});

// ── Mini todo app styles ────────────────────────────────────

const app = css({
  wrap: [
    'p:5',
    {
      '&': {
        'font-family': 'var(--font-sans)',
        'font-size': '0.8rem',
      },
    },
  ],
  inputRow: ['flex', 'gap:2', 'mb:3'],
  input: [
    {
      '&': {
        flex: '1',
        height: '36px',
        padding: '0 0.75rem',
        background: '#111110',
        border: '1px solid #2A2826',
        'border-radius': '6px',
        'box-sizing': 'border-box',
        color: '#E8E4DC',
        'font-size': '0.8rem',
        'font-family': 'var(--font-sans)',
        outline: 'none',
      },
      '&::placeholder': { color: '#4A4540' },
      '&:focus': { 'border-color': '#C8451B' },
    },
  ],
  addBtn: [
    {
      '&': {
        height: '36px',
        padding: '0 1rem',
        background: '#C8451B',
        border: 'none',
        'border-radius': '6px',
        'box-sizing': 'border-box',
        color: '#fff',
        'font-size': '0.8rem',
        'font-family': 'var(--font-sans)',
        cursor: 'pointer',
        'white-space': 'nowrap',
      },
      '&:hover': { background: '#d65229' },
    },
  ],
  listWrap: [
    {
      '&': {
        position: 'relative',
        'max-height': '280px',
        'overflow-y': 'auto',
        'scrollbar-width': 'thin',
        'scrollbar-color': '#4A4540 transparent',
      },
    },
  ],
  listFade: [
    {
      '&': {
        left: '0',
        right: '0',
        height: '28px',
        'pointer-events': 'none',
        'z-index': '1',
        transition: 'opacity 250ms ease',
      },
    },
  ],
  listFadeTop: [
    {
      '&': {
        background: 'linear-gradient(to bottom, #1C1B1A, transparent)',
      },
    },
  ],
  listFadeBottom: [
    {
      '&': {
        background: 'linear-gradient(to top, #1C1B1A, transparent)',
      },
    },
  ],
  list: [
    'flex',
    'flex-col',
    'gap:1',
  ],
  todo: [
    'flex',
    'items:center',
    'gap:3',
    {
      '&': {
        padding: '0.5rem 0.75rem',
        background: '#111110',
        'border-radius': '2px',
        border: '1px solid #2A2826',
      },
      '&[data-presence="enter"]': {
        animation: `${listEnter} 200ms ease-out`,
      },
      '&[data-presence="exit"]': {
        overflow: 'hidden',
        'pointer-events': 'none',
      },
    },
  ],
  checkbox: [
    {
      '&': {
        width: '0.875rem',
        height: '0.875rem',
        'border-radius': '2px',
        cursor: 'pointer',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'flex-shrink': '0',
        padding: '0',
        'line-height': '1',
        border: '1px solid #4A4540',
        background: 'transparent',
        color: '#fff',
        position: 'relative',
      },
      '&[data-state="checked"]': {
        background: '#C8451B',
        'border-color': '#C8451B',
      },
      '&[data-state="checked"][data-toggled]': {
        animation: `${checkBgIn} 150ms ease-out forwards`,
      },
      '&[data-state="unchecked"][data-toggled]': {
        animation: `${checkBgOut} 150ms ease-out forwards`,
      },
      '& [data-part="indicator"]': {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'pointer-events': 'none',
      },
      '& [data-part="indicator-icon"]': {
        width: '9px',
        height: '9px',
        opacity: '0',
        transform: 'scale(0.5)',
      },
      '& [data-icon="check"] path': {
        'stroke-dasharray': '30',
        'stroke-dashoffset': '30',
      },
      '&[data-state="checked"] [data-icon="check"]': {
        opacity: '1',
        transform: 'scale(1)',
      },
      '&[data-state="checked"] [data-icon="check"] path': {
        'stroke-dashoffset': '0',
      },
      '&[data-state="checked"][data-toggled] [data-icon="check"]': {
        animation: `${checkIconIn} 150ms ease-out forwards`,
      },
      '&[data-state="checked"][data-toggled] [data-icon="check"] path': {
        animation: `${checkStrokeIn} 200ms ease-out 50ms forwards`,
      },
      '&[data-state="unchecked"][data-toggled] [data-icon="check"]': {
        animation: `${checkIconOut} 150ms ease-out forwards`,
      },
      '&[data-state="unchecked"][data-toggled] [data-icon="check"] path': {
        animation: `${checkStrokeOut} 150ms ease-out forwards`,
      },
    },
  ],
  todoText: [
    {
      '&': {
        flex: '1',
        transition: 'color 0.15s',
        'min-width': '0',
      },
    },
  ],
  deleteBtn: [
    {
      '&': {
        background: 'none',
        border: 'none',
        color: '#4A4540',
        cursor: 'pointer',
        padding: '0.25rem',
        'font-size': '0.7rem',
        'line-height': '1',
        'flex-shrink': '0',
        transition: 'color 0.15s',
      },
      '&:hover': { color: '#ef4444' },
    },
  ],
  counter: [
    {
      '&': {
        'margin-top': '0.75rem',
        'font-size': '0.7rem',
        color: '#4A4540',
        'font-family': 'var(--font-mono)',
      },
    },
  ],
});

// ── Mini todo app component ─────────────────────────────────

/** WebSocket URL for presence — injected at build time via --define */
declare const PRESENCE_WS_URL: string;

type Todo = { id: number; text: string; done: boolean; toggled?: boolean };

const INITIAL_TODOS: Todo[] = [
  { id: 1, text: 'Design the schema', done: true },
  { id: 2, text: 'Generate the API', done: true },
  { id: 3, text: 'Build the UI', done: false },
  { id: 4, text: 'Ship to production', done: false },
];

function MiniTodoApp() {
  let todos: Todo[] = [...INITIAL_TODOS];
  let nextId = 5;
  let inputValue = '';
  let showTopFade = false;
  let showBottomFade = false;

  function updateFadeFromEl(el: HTMLElement) {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflows = scrollHeight > clientHeight + 2;
    showTopFade = overflows && scrollTop > 2;
    showBottomFade = overflows && scrollTop + clientHeight < scrollHeight - 2;
  }

  function handleScroll(e: Event) {
    updateFadeFromEl(e.currentTarget as HTMLElement);
  }

  function deferUpdateFade() {
    setTimeout(() => {
      const el = document.querySelector('[data-todo-scroll]') as HTMLElement | null;
      if (el) updateFadeFromEl(el);
    }, 50);
  }

  function flashGlow(selector: string) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetHeight;
    el.style.transition = 'opacity 0.8s ease-out';
    el.style.opacity = '0';
  }

  // Reference to the active WebSocket, set by onMount
  let presenceWs: WebSocket | null = null;

  function sendInteract() {
    if (presenceWs && presenceWs.readyState === WebSocket.OPEN) {
      presenceWs.send('{"t":"interact"}');
    }
  }

  function addTodo() {
    if (!inputValue.trim()) return;
    todos = [...todos, { id: nextId, text: inputValue.trim(), done: false }];
    nextId = nextId + 1;
    inputValue = '';
    deferUpdateFade();
    flashGlow('[data-hero-flash]');
    sendInteract();
  }

  // ── Simulated peer activity (fallback when no real peers) ──
  const PEER_ITEMS = [
    'Set up authentication',
    'Add dark mode toggle',
    'Write integration tests',
    'Configure CI pipeline',
    'Create API docs',
    'Optimize bundle size',
    'Add error boundaries',
    'Set up monitoring',
  ];
  let peerItemIndex = 0;
  let hasRealPeers = false;

  function handlePeerInteract() {
    const text = PEER_ITEMS[peerItemIndex % PEER_ITEMS.length];
    peerItemIndex++;
    todos = [...todos, { id: nextId, text, done: false }];
    nextId = nextId + 1;
    deferUpdateFade();
    flashGlow('[data-hero-flash-peer]');
  }

  onMount(() => {
    let keepaliveId: ReturnType<typeof setInterval> | null = null;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let stopped = false;

    const MAX_RETRIES = 3;
    const BACKOFF_BASE_MS = 1000;
    const PERIODIC_RETRY_MS = 60_000;

    const wsUrl = typeof PRESENCE_WS_URL !== 'undefined'
      ? PRESENCE_WS_URL
      : 'ws://localhost:4001/__presence';

    // ── WebSocket connection with reconnection ──────────────
    function connectPresence() {
      if (stopped) return;

      try {
        presenceWs = new WebSocket(wsUrl);

        presenceWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.t === 'interact') {
              handlePeerInteract();
            } else if (msg.t === 'join' || msg.t === 'state') {
              hasRealPeers = (msg.count ?? 0) > 1;
            } else if (msg.t === 'leave') {
              hasRealPeers = (msg.count ?? 0) > 1;
            }
          } catch {
            // Malformed message, ignore
          }
        };

        presenceWs.onopen = () => {
          retryCount = 0; // Reset backoff on successful connection
          keepaliveId = setInterval(() => {
            if (presenceWs && presenceWs.readyState === WebSocket.OPEN) {
              presenceWs.send('{"t":"ping"}');
            }
          }, 30_000);
        };

        presenceWs.onclose = () => {
          hasRealPeers = false;
          presenceWs = null;
          if (keepaliveId) clearInterval(keepaliveId);
          keepaliveId = null;

          if (!stopped) scheduleReconnect();
        };

        presenceWs.onerror = () => {
          // Will trigger onclose → scheduleReconnect
        };
      } catch {
        // WebSocket not available — schedule reconnect
        if (!stopped) scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (stopped) return;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);

      if (retryCount < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount);
        retryCount++;
        retryTimeoutId = setTimeout(connectPresence, delay);
      } else {
        // Backoff exhausted — periodic retry every 60s
        retryTimeoutId = setTimeout(connectPresence, PERIODIC_RETRY_MS);
      }
    }

    function disconnect() {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
      if (keepaliveId) clearInterval(keepaliveId);
      keepaliveId = null;
      if (presenceWs) {
        presenceWs.onclose = null; // Prevent scheduleReconnect
        presenceWs.close();
        presenceWs = null;
      }
      hasRealPeers = false;
    }

    // ── Tab visibility ──────────────────────────────────────
    function handleVisibilityChange() {
      if (document.hidden) {
        disconnect();
      } else {
        retryCount = 0;
        connectPresence();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Online/offline ──────────────────────────────────────
    function handleOnline() {
      retryCount = 0; // Reset backoff
      disconnect();
      connectPresence();
    }
    window.addEventListener('online', handleOnline);

    // ── Start connection ────────────────────────────────────
    connectPresence();

    // ── Simulated peer timer (fallback) ────────────────────
    function schedulePeer() {
      const delay = 6000 + Math.random() * 8000; // 6-14s
      return setTimeout(() => {
        if (!hasRealPeers) {
          handlePeerInteract();
        }
        simTimerId = schedulePeer();
      }, delay);
    }
    let simTimerId = schedulePeer();

    return () => {
      stopped = true;
      clearTimeout(simTimerId);
      disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  });

  function toggleTodo(id: number) {
    todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done, toggled: true } : t));
  }

  function deleteTodo(id: number) {
    todos = todos.filter((t) => t.id !== id);
    deferUpdateFade();
  }

  return (
    <div className={app.wrap}>
      <form className={app.inputRow} onSubmit={(e: Event) => { e.preventDefault(); addTodo(); }}>
        <input
          type="text"
          className={app.input}
          style={{ height: '36px', padding: '0 0.75rem', border: '1px solid #2A2826', borderRadius: '6px', background: '#111110', color: '#E8E4DC', fontSize: '0.8rem' }}
          placeholder="What needs to be done?"
          value={inputValue}
          onInput={(e: Event) => { inputValue = (e.target as HTMLInputElement).value; }}
        />
        <button type="submit" className={app.addBtn} style={{ height: '36px', borderRadius: '6px', border: '1px solid #2A2826' }}>
          Add
        </button>
      </form>

      <div
        className={app.listWrap}
        data-todo-scroll
        onScroll={handleScroll}
      >
        <div
          className={`${app.listFade} ${app.listFadeTop}`}
          style={{ opacity: showTopFade ? 1 : 0, position: 'sticky', top: '0', marginBottom: '-28px' }}
        />
        <List animate={{ duration: 200, easing: 'ease-out' }} className={app.list}>
          {todos.map((todo) => (
            <List.Item key={todo.id} className={app.todo}>
              <button
                type="button"
                role="checkbox"
                aria-checked={todo.done ? 'true' : 'false'}
                data-state={todo.done ? 'checked' : 'unchecked'}
                data-toggled={todo.toggled ? '' : undefined}
                className={app.checkbox}
                onClick={() => toggleTodo(todo.id)}
              >
                <span data-part="indicator" data-state={todo.done ? 'checked' : 'unchecked'}>
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    data-part="indicator-icon"
                    data-icon="check"
                  >
                    <path d="M4 12 9 17 20 6" />
                  </svg>
                </span>
              </button>
              <span
                className={app.todoText}
                style={{
                  color: todo.done ? '#4A4540' : '#E8E4DC',
                  textDecoration: todo.done ? 'line-through' : 'none',
                }}
              >
                {todo.text}
              </span>
              <button
                type="button"
                className={app.deleteBtn}
                onClick={() => deleteTodo(todo.id)}
              >
                ×
              </button>
            </List.Item>
          ))}
        </List>
        <div
          className={`${app.listFade} ${app.listFadeBottom}`}
          style={{ opacity: showBottomFade ? 1 : 0, position: 'sticky', bottom: '0', marginTop: '-28px' }}
        />
      </div>

      <div className={app.counter}>
        {todos.filter((t) => !t.done).length} remaining
      </div>
    </div>
  );
}

const ROTATING_WORDS = ['framework.', 'stack.', 'ecosystem.', 'compiler.', 'runtime.', 'devtool.'];

function RotatingWord() {
  let activeIndex = 0;
  let prevIndex = -1;

  setInterval(() => {
    prevIndex = activeIndex;
    activeIndex = (activeIndex + 1) % ROTATING_WORDS.length;
  }, 2500);

  return (
    <span className={s.rotatingWrap}>
      {ROTATING_WORDS.map((word, i) => {
        const isActive = activeIndex === i;
        const isLeaving = prevIndex === i;
        const shouldAnimate = isActive || isLeaving;

        return (
          <span
            key={word}
            className={isActive ? s.rotatingWordActive : s.rotatingWord}
            style={{
              opacity: isActive ? 1 : 0,
              transform: isActive
                ? 'translateY(0)'
                : isLeaving
                  ? 'translateY(100%)'
                  : 'translateY(-100%)',
              transition: shouldAnimate
                ? 'transform 0.35s ease, opacity 0.35s ease'
                : 'none',
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}

function HeroCodeGroup() {
  let activeTab = 'ui';

  return (
    <div className={s.codeGroup} style={{ borderColor: '#2A2826' }}>
      <div className={s.tabBar}>
        {CODE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={s.tab}
            style={{
              fontFamily: 'var(--font-mono)',
              color: activeTab === tab.id ? '#C8451B' : '#6B6560',
              borderBottomColor: activeTab === tab.id ? '#C8451B' : 'transparent',
            }}
            onClick={() => { activeTab = tab.id; }}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className={s.tab}
          style={{
            fontFamily: 'var(--font-mono)',
            color: activeTab === 'app' ? '#C8451B' : '#6B6560',
            borderBottomColor: activeTab === 'app' ? '#C8451B' : 'transparent',
          }}
          onClick={() => { activeTab = 'app'; }}
        >
          App
        </button>
      </div>
      <div style={{ display: 'grid' }}>
        {CODE_TABS.map((tab) => (
          <div
            key={tab.id}
            className={s.codeBody}
            style={{
              gridArea: '1 / 1',
              visibility: activeTab === tab.id ? 'visible' : 'hidden',
            }}
          >
            <TokenLines lines={tab.tokens} />
          </div>
        ))}
        <div
          style={{
            gridArea: '1 / 1',
            visibility: activeTab === 'app' ? 'visible' : 'hidden',
          }}
        >
          <MiniTodoApp />
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className={s.section}>
      <div className={s.grid}>
        <div className={s.textCol}>
          <div className={s.badge} style={{ justifyContent: 'center' }}>
            <span className={s.badgeDotWrap}>
              <span className={s.badgeDotPing} style={{ background: '#fbbf24' }} />
              <span className={s.badgeDot} style={{ background: '#f59e0b' }} />
            </span>
            <span className={s.badgeText} style={{ fontFamily: 'var(--font-mono)' }}>
              Canary
            </span>
          </div>

          <h1
            className={s.h1}
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', letterSpacing: '-0.025em', lineHeight: '1.15' }}
          >
            <span className={s.h1Line}>The agent-native</span>
            <span className={s.h1LineFaded}>
              <Island component={RotatingWord} />
            </span>
          </h1>

          <p className={s.description}>
            One schema derives your database, API, and UI.{' '}
            <span className={s.descriptionHighlight}>
              Fully typed end-to-end. Built for agents to write, humans to ship.
            </span>
          </p>

          <div className={s.ctas}>
            <Island component={CopyButton} />
            <a
              href="https://github.com/vertz-dev/vertz"
              target="_blank"
              rel="noopener"
              className={s.githubLink}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              View on GitHub →
            </a>
          </div>
        </div>

        <div className={s.codeCol}>
          <Island component={HeroCodeGroup} />
        </div>
      </div>
    </section>
  );
}
