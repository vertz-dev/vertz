import { describe, expect, it } from 'bun:test';
import { createReadyGate } from '../ready-gate';

describe('Feature: Restart-to-ready gate', () => {
  describe('Given a server during start (initial or restart)', () => {
    describe('When a WebSocket client connects before discoverHMRAssets completes', () => {
      it('Then the connected message is deferred until the server is ready', () => {
        const gate = createReadyGate();
        const sent: string[] = [];
        const ws = {
          sendText: (msg: string) => {
            sent.push(msg);
          },
        };

        // Client connects while gate is closed
        gate.onOpen(ws as any);

        // No 'connected' message should be sent yet
        expect(sent).toEqual([]);
      });
    });

    describe('When discoverHMRAssets completes', () => {
      it('Then all pending clients receive the connected message', () => {
        const gate = createReadyGate();
        const sent1: string[] = [];
        const sent2: string[] = [];
        const ws1 = {
          sendText: (msg: string) => {
            sent1.push(msg);
          },
        };
        const ws2 = {
          sendText: (msg: string) => {
            sent2.push(msg);
          },
        };

        gate.onOpen(ws1 as any);
        gate.onOpen(ws2 as any);
        expect(sent1).toEqual([]);
        expect(sent2).toEqual([]);

        // Gate opens
        gate.open();

        expect(sent1).toEqual([JSON.stringify({ type: 'connected' })]);
        expect(sent2).toEqual([JSON.stringify({ type: 'connected' })]);
      });
    });

    describe('When discoverHMRAssets fails', () => {
      it('Then pending clients still receive connected (gate opens regardless)', () => {
        const gate = createReadyGate();
        const sent: string[] = [];
        const ws = {
          sendText: (msg: string) => {
            sent.push(msg);
          },
        };

        gate.onOpen(ws as any);
        expect(sent).toEqual([]);

        // Gate opens (even on failure — caller uses finally block)
        gate.open();

        expect(sent).toEqual([JSON.stringify({ type: 'connected' })]);
      });
    });
  });

  describe('Given a server that has completed startup', () => {
    describe('When a WebSocket client connects after discoverHMRAssets', () => {
      it('Then onOpen returns false so the caller sends connected immediately', () => {
        const gate = createReadyGate();
        const ws = { sendText: (_msg: string) => {} };

        // Gate is already open
        gate.open();

        // Client connects after gate opened — onOpen returns false (not queued)
        const queued = gate.onOpen(ws as any);
        expect(queued).toBe(false);
      });
    });
  });

  describe('Given a pending client that disconnects before the gate opens', () => {
    describe('When the gate opens', () => {
      it('Then the disconnected client is skipped without error', () => {
        const gate = createReadyGate();
        const sent: string[] = [];
        const ws = {
          sendText: (msg: string) => {
            sent.push(msg);
          },
        };

        gate.onOpen(ws as any);
        gate.onClose(ws as any);

        // Gate opens — should not crash, should not send to removed client
        gate.open();
        expect(sent).toEqual([]);
      });
    });
  });

  describe('Given a pending client whose sendText throws on flush', () => {
    describe('When the gate opens', () => {
      it('Then other pending clients still receive connected', () => {
        const gate = createReadyGate();
        const sent2: string[] = [];
        const brokenWs = {
          sendText: () => {
            throw new Error('already closed');
          },
        };
        const goodWs = {
          sendText: (msg: string) => {
            sent2.push(msg);
          },
        };

        gate.onOpen(brokenWs as any);
        gate.onOpen(goodWs as any);

        // Should not throw — broken client is skipped
        gate.open();
        expect(sent2).toEqual([JSON.stringify({ type: 'connected' })]);
      });
    });
  });

  describe('Given there is a current error when the gate opens', () => {
    describe('When pending clients are flushed', () => {
      it('Then clients receive both connected and the error', () => {
        const currentError = {
          category: 'build' as const,
          errors: [{ message: 'Syntax error' }],
        };
        const gate = createReadyGate();
        const sent: string[] = [];
        const ws = {
          sendText: (msg: string) => {
            sent.push(msg);
          },
        };

        gate.onOpen(ws as any);

        // Gate opens with error context
        gate.open(currentError);

        expect(sent).toEqual([
          JSON.stringify({ type: 'connected' }),
          JSON.stringify({
            type: 'error',
            category: 'build',
            errors: [{ message: 'Syntax error' }],
          }),
        ]);
      });
    });
  });

  describe('Given the gate is already open', () => {
    describe('When open() is called again', () => {
      it('Then it is a no-op (idempotent)', () => {
        const gate = createReadyGate();
        gate.open();

        // Should not throw
        gate.open();
        expect(gate.isReady).toBe(true);
      });
    });
  });

  describe('Given a gate with a timeoutMs option', () => {
    describe('When the timeout fires before open() is called', () => {
      it('Then the gate auto-opens and pending clients are flushed', async () => {
        const sent: string[] = [];
        const ws = {
          sendText: (msg: string) => {
            sent.push(msg);
          },
        };
        const gate = createReadyGate({ timeoutMs: 50 });

        gate.onOpen(ws as any);
        expect(sent).toEqual([]);

        // Wait for the timeout to fire
        await new Promise((r) => setTimeout(r, 80));

        expect(gate.isReady).toBe(true);
        expect(sent).toEqual([JSON.stringify({ type: 'connected' })]);
      });
    });

    describe('When open() is called before the timeout fires', () => {
      it('Then the timeout is cancelled and does not double-flush', async () => {
        const sent: string[] = [];
        const ws = {
          sendText: (msg: string) => {
            sent.push(msg);
          },
        };
        const gate = createReadyGate({ timeoutMs: 100 });

        gate.onOpen(ws as any);

        // Open before timeout
        gate.open();
        expect(sent).toEqual([JSON.stringify({ type: 'connected' })]);

        // Wait past the timeout — should not double-flush
        await new Promise((r) => setTimeout(r, 150));
        expect(sent).toEqual([JSON.stringify({ type: 'connected' })]);
      });
    });

    describe('When the timeout fires', () => {
      it('Then onTimeoutWarning callback is invoked', async () => {
        let warned = false;
        // Gate must be created to start the timeout — unused reference is intentional
        createReadyGate({
          timeoutMs: 50,
          onTimeoutWarning: () => {
            warned = true;
          },
        });

        await new Promise((r) => setTimeout(r, 80));

        expect(warned).toBe(true);
      });
    });
  });
});
