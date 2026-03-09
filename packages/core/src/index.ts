/**
 * @liuovo/agentation-vue-core
 *
 * Framework-agnostic core for agentation-vue:
 * - types/       — Annotation schema & shared type definitions
 * - dom/         — Element identification & animation freezing
 * - storage/     — localStorage persistence with configurable prefix
 * - transport/   — Sync protocol (MCP/WebSocket)
 * - export/      — Markdown & JSON output generation
 */

// Types
export * from "./types/index.ts"

// DOM utilities (element identification only — freeze-animations has side effects)
export * from "./dom/index.ts"

// Storage
export * from "./storage/index.ts"

// Transport / sync
export * from "./transport/index.ts"

// Export formatters
export * from "./export/index.ts"
