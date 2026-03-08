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
export * from "./types/index.js"

// DOM utilities (element identification only — freeze-animations has side effects)
export * from "./dom/index.js"

// Storage
export * from "./storage/index.js"

// Transport / sync
export * from "./transport/index.js"

// Export formatters
export * from "./export/index.js"
