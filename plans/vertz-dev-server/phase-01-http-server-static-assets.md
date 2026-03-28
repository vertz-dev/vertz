# Phase 1: HTTP Server + Static Assets

**Prerequisites:** Phase 0 (compiler crate refactoring) complete.

**Goal:** A Rust binary that starts an HTTP server, serves static files, handles port conflicts, and displays a developer-friendly startup banner.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.1

---

## What to Implement

1. **Crate scaffold** — `native/vertz-runtime/` with `Cargo.toml`, dependencies, workspace membership
2. **CLI entry point** — `clap`-based argument parsing: `vertz-runtime dev --port 3000 --host localhost`
3. **axum HTTP server** — basic router with static file serving
4. **Static file serving** — `tower-http::ServeDir` for `public/` directory
5. **Port conflict handling** — detect busy port, auto-increment (3000 → 3001 → 3002), display chosen port
6. **Startup banner** — version, local URL, network URL, startup time, keyboard shortcuts
7. **Request logging** — colored output: method, path, status code, response time
8. **Graceful shutdown** — SIGINT/SIGTERM handler, drain connections within 5s timeout

---

## Tasks

### Task 1: Create `vertz-runtime` crate scaffold

**What to do:**
- Create `native/vertz-runtime/Cargo.toml` with dependencies:
  - `axum` 0.7.x, `tokio` 1.x (full), `tower-http` (serve-dir, compression)
  - `clap` (derive feature), `owo-colors` (terminal colors)
  - `vertz-compiler-core` (path dependency — not used yet, but declared)
- Add `vertz-runtime` to `native/Cargo.toml` workspace members
- Create `src/main.rs` with minimal `#[tokio::main]` entry

**Files to create:**
```
native/vertz-runtime/
├── Cargo.toml
└── src/
    └── main.rs
```

**Acceptance criteria:**
- [ ] `cargo check -p vertz-runtime` compiles
- [ ] `cargo run -p vertz-runtime` runs without crash (can just print "hello" for now)

---

### Task 2: CLI argument parsing

**What to do:**
- Define a `clap` `Args` struct with: `--port` (default 3000), `--host` (default "localhost"), `--public-dir` (default "public")
- Subcommand: `dev` (only subcommand for now)
- Parse args in `main.rs`

**Files to create:**
```
native/vertz-runtime/src/
└── cli.rs            # NEW — clap Args + subcommands
```

**Acceptance criteria:**
- [ ] `cargo run -p vertz-runtime -- dev --port 4000` parses port=4000
- [ ] `cargo run -p vertz-runtime -- dev` uses default port=3000
- [ ] `cargo run -p vertz-runtime -- --help` shows usage

---

### Task 3: axum HTTP server + basic routing

**What to do:**
- Create `server/http.rs` with a function `start_server(config) -> Result<()>`
- Set up axum Router with a placeholder route: `GET /` returns "Vertz Dev Server"
- Bind to `host:port` with `tokio::net::TcpListener`
- Wire into `main.rs`

**Files to create:**
```
native/vertz-runtime/src/
├── server/
│   ├── mod.rs
│   └── http.rs       # NEW — axum router + server start
└── config.rs         # NEW — ServerConfig struct
```

**Acceptance criteria:**
- [ ] Server starts and responds to `GET /` with 200
- [ ] Server binds to configured port and host
- [ ] Terminal shows "listening on http://localhost:3000" (basic, banner comes later)

---

### Task 4: Static file serving

**What to do:**
- Add `tower-http::services::ServeDir` as a fallback route for the `public/` directory
- MIME types are handled automatically by `tower-http`
- Create a test fixture: `tests/fixtures/public/` with `index.html`, `styles.css`, `logo.png`

**Files to modify:**
```
native/vertz-runtime/src/server/http.rs   # MODIFY — add ServeDir fallback
```

**Files to create:**
```
native/vertz-runtime/tests/
├── fixtures/
│   └── public/
│       ├── index.html
│       ├── styles/
│       │   └── app.css
│       └── assets/
│           └── logo.txt    # placeholder for binary asset
└── static_serving.rs       # integration test
```

**Acceptance criteria:**
- [ ] `GET /index.html` returns file with `Content-Type: text/html`
- [ ] `GET /styles/app.css` returns file with `Content-Type: text/css`
- [ ] `GET /missing.txt` returns 404
- [ ] Subdirectory traversal works (`/styles/app.css`)
- [ ] No path traversal vulnerability (`/../etc/passwd` returns 404, not file contents)

---

### Task 5: Port conflict detection + auto-increment

**What to do:**
- Before binding, attempt to bind the port. If `AddrInUse`, try `port + 1`, up to 10 attempts.
- Log which port was actually bound: "Port 3000 in use, using 3001"
- If all 10 attempts fail, exit with clear error message.

**Files to modify:**
```
native/vertz-runtime/src/server/http.rs   # MODIFY — add port retry logic
```

**Acceptance criteria:**
- [ ] When configured port is free, server binds to it
- [ ] When configured port is busy, server tries next port
- [ ] Terminal logs "Port 3000 in use, using 3001" when auto-incrementing
- [ ] After 10 failed attempts, exits with error message

---

### Task 6: Startup banner

**What to do:**
- After successful bind, print a formatted banner with:
  - Vertz version (hardcoded for now, e.g., "0.1.0-dev")
  - Local URL: `http://localhost:{port}`
  - Network URL: detect LAN IP address, `http://{ip}:{port}`
  - Startup time: measure from process start to "ready"
  - Keyboard shortcuts: `r` (restart), `o` (open browser), `c` (clear), `q` (quit)
- Use `owo-colors` for colored output

**Files to create:**
```
native/vertz-runtime/src/
└── banner.rs         # NEW — startup banner formatting
```

**Acceptance criteria:**
- [ ] Banner displays local URL correctly
- [ ] Banner displays network URL (or "not available" if no network)
- [ ] Banner displays startup time in milliseconds
- [ ] Banner is visually clean (box-drawn border, colored)

---

### Task 7: Request logging

**What to do:**
- Add axum middleware (tower layer) that logs each request:
  - `HH:MM:SS [status] METHOD /path (Xms)`
  - Color: green for 2xx, yellow for 3xx, red for 4xx/5xx
- Use `owo-colors` for coloring

**Files to create:**
```
native/vertz-runtime/src/server/
└── logging.rs        # NEW — request logging middleware
```

**Acceptance criteria:**
- [ ] Each request produces a log line with method, path, status, timing
- [ ] 200 responses are green, 404 are red
- [ ] Timing is accurate (measured from request start to response)

---

### Task 8: Graceful shutdown

**What to do:**
- Listen for `SIGINT` (Ctrl+C) and `SIGTERM` via `tokio::signal`
- On signal: stop accepting new connections, drain existing within 5s, then exit
- Print "Shutting down..." message

**Files to modify:**
```
native/vertz-runtime/src/main.rs          # MODIFY — add signal handler
native/vertz-runtime/src/server/http.rs   # MODIFY — graceful shutdown support
```

**Acceptance criteria:**
- [ ] Ctrl+C cleanly shuts down the server
- [ ] "Shutting down..." message is printed
- [ ] Process exits with code 0

---

## Quality Gates

```bash
cd native && cargo check -p vertz-runtime
cd native && cargo test -p vertz-runtime
cd native && cargo clippy -p vertz-runtime
cd native && cargo fmt -p vertz-runtime -- --check
```

---

## Notes

- This phase produces a functioning binary that can serve a static website
- No JavaScript execution yet — that's Phase 2
- The `vertz-compiler-core` dependency is declared but not used yet
- Integration tests should use `reqwest` to make HTTP requests against the running server
- Consider using `axum::serve` with `tokio::net::TcpListener` for the server (axum 0.7 pattern)
