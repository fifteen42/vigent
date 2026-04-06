# Vigent

macOS Computer Use Agent — record your screen operations and replay them automatically.

## What it does

1. **Record** — Captures your mouse clicks, keyboard input, and scroll events using macOS CGEvent tap, along with screenshots at each step
2. **Replay** — Replays recorded operations with precise coordinates and timing using native Rust/enigo input control
3. **Natural Language** (WIP) — Describe a task in plain text, and the agent executes it by observing the screen via local LLM (Gemma 4 E4B)

## Architecture

```
┌──────────────────────────────────────────┐
│              CLI (TypeScript)            │
│   vigent record / replay / run           │
└──────────┬───────────────┬───────────────┘
           │               │
   ┌───────▼──────┐ ┌──────▼────────┐
   │ Swift Native  │ │ Rust Native    │
   │ - Screenshot  │ │ - Mouse/Key    │
   │ - CGEvent tap │ │ - Scroll/Drag  │
   │ - App mgmt    │ │ (enigo + napi) │
   │ - Accessibility│ │               │
   └──────────────┘ └───────────────┘
```

## Tech Stack

- **TypeScript** — CLI, agent logic, pi-mono framework
- **Swift** — Screenshot (CGDisplayCreateImage), global event monitoring (CGEvent tap), app management (NSWorkspace), Accessibility API
- **Rust** — High-performance input simulation via enigo, exposed to Node.js through napi-rs
- **Gemma 4 E4B** — Local vision model via Ollama (for natural language mode)

## Requirements

- macOS 13+
- Node.js 20+, pnpm
- Rust toolchain
- Swift 5.9+ / Xcode
- Ollama with `gemma4:e4b` (optional, for natural language mode)
- **Accessibility** and **Input Monitoring** permissions granted to your terminal app

## Quick Start

```bash
pnpm install

# Build native modules
cd packages/native-input && pnpm build
cd packages/native-swift && swift build -c release

# Build TypeScript
pnpm -r build

# Record your actions (Ctrl+C to stop)
node packages/agent/dist/index.js record

# Replay a recording
node packages/agent/dist/index.js replay recordings/<id>/actions.json
```

## Project Structure

```
packages/
  native-input/   — Rust/enigo mouse & keyboard control (napi-rs)
  native-swift/   — Swift screenshot, CGEvent tap, app management
  core/           — Shared TypeScript types (ActionEvent, ActionLog)
  recorder/       — Recording module (event capture + screenshots)
  agent/          — CLI entry point, replay engine, natural language mode
```

## Status

- [x] Global event recording (mouse, keyboard, scroll)
- [x] Screenshot capture per event
- [x] Exact coordinate replay
- [x] Environment restoration (auto-open recorded app)
- [ ] Smart replay with state verification
- [ ] Natural language Computer Use (blocked on model capability)

## License

MIT
