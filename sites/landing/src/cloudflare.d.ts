// Cloudflare Workers types used by the Durable Object presence room.
// Minimal declarations to avoid pulling in @cloudflare/workers-types
// (which conflicts with bun-types globals).

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface WebSocket {
  accept(): void;
}

interface ResponseInit {
  webSocket?: WebSocket;
}
