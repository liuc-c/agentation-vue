# @liuovo/agentation-vue-core

Framework-agnostic core utilities for `agentation-vue`.

This package contains the shared annotation schema plus the DOM identification,
storage, transport, and export logic used by the Vue runtime.

## Install

```bash
pnpm add @liuovo/agentation-vue-core
```

## What It Exposes

- Shared annotation and source-location types
- DOM helpers for element identification
- Animation freeze helpers
- localStorage-backed persistence utilities
- Sync transport helpers for the MCP/HTTP server
- Markdown and JSON export formatters

## Subpath Exports

```ts
import { freeze, unfreeze } from "@liuovo/agentation-vue-core/dom/freeze-animations"
```

## Recommended Usage

Most applications should install
[`vite-plugin-agentation-vue`](../vite-plugin-agentation-vue/README.md) instead
of wiring the lower-level packages directly.

## License

PolyForm Shield 1.0.0
