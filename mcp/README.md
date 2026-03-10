# Agentation MCP

MCP (Model Context Protocol) server for Agentation - visual feedback for AI coding agents.

This package provides the local Agentation companion:

- V2 browser sync API for the toolbar
- MCP tools so coding agents can read and resolve annotations
- ACP-compatible local agent bridge so the page can notify local agents directly

## Installation

```bash
npm install agentation-vue-mcp
# or
pnpm add agentation-vue-mcp
```

## Quick Start

### 1. Start the local companion

```bash
agentation-vue-mcp server --port 4748
```

This starts the unified local companion on one port:
- **Browser sync API** (`/v2/*`) - receives annotations from the Vue plugin
- **MCP transport server** (`/mcp` and `/sse`) - exposed on the same port
- **MCP stdio server** - enabled by default for Claude Code and other stdio clients

### 2. Initialize local agents

```bash
agentation-vue-mcp agents init
agentation-vue-mcp agents doctor
```

This writes `~/.agentation/agents.json` from the embedded ACP registry snapshot and probes local ACP-compatible agent commands.

### 2.1 Update the embedded ACP snapshot locally

Runtime discovery is snapshot-only. To refresh the embedded agent catalog, update the snapshot in this repository and rebuild:

```bash
pnpm --filter agentation-vue-mcp update-registry-snapshot
```

To generate from a local clone of the upstream registry instead of the CDN index:

```bash
pnpm --filter agentation-vue-mcp update-registry-snapshot -- --source /path/to/agentclientprotocol-registry --source-label https://github.com/agentclientprotocol/registry
```

### 3. Add MCP tools to your agent

The fastest way to configure Agentation across any supported agent:

```bash
npx add-mcp "npx -y agentation-vue-mcp server --port 4748"
```

Uses [add-mcp](https://github.com/neondatabase/add-mcp) to auto-detect installed agents (Claude Code, Cursor, Codex, Windsurf, and more).

Or for Claude Code specifically:

```bash
claude mcp add agentation -- npx agentation-vue-mcp server --port 4748
```


### 4. Verify your setup

```bash
agentation-vue-mcp doctor
```

## CLI Commands

```bash
agentation-vue-mcp init                    # Setup wizard (registers via claude mcp add)
agentation-vue-mcp agents [list|init|doctor]
agentation-vue-mcp server [options]        # Start the annotation server
agentation-vue-mcp doctor                  # Check your setup
agentation-vue-mcp help                    # Show help
```

### Server Options

```bash
--port <port>      # Unified companion port for /v2, /mcp, and /sse (default: 4748)
--mcp-only         # Skip the local HTTP companion and only expose stdio MCP
--http-url <url>   # Agentation API base URL for MCP tools to fetch from
--no-stdio         # Disable stdio MCP transport
```

## MCP Tools

The MCP server exposes these tools to AI agents:

| Tool | Description |
|------|-------------|
| `agentation_v2_list_projects` | Group tracked sessions by project for shared-server workflows |
| `agentation_v2_get_session` | Inspect one session with workflow fields and agent context |
| `agentation_v2_get_pending` | Read pending annotations, scoped by `sessionId` or `projectFilter` |
| `agentation_v2_acknowledge` | Mark an annotation as acknowledged |
| `agentation_v2_resolve` | Resolve an annotation and optionally append an agent summary |
| `agentation_v2_dismiss` | Dismiss an annotation and record the reason in the thread |
| `agentation_v2_reply` | Add an agent reply without changing workflow status |
| `agentation_v2_watch_annotations` | Wait for scoped pending annotations in shared-server mode |
| `agentation_v2_delete_project_annotations` | Preview or delete one project's annotations with explicit confirmation |

Shared-server safety rules:

- Sessions are grouped by explicit `projectId` when present, otherwise by inferred origin/path prefix.
- `agentation_v2_get_pending` and `agentation_v2_watch_annotations` require explicit scope when multiple projects share the server.
- `agentation_v2_delete_project_annotations` is preview-first and requires `confirm: true`.

## HTTP API

The browser sync API provides a V2 REST API for the Vue toolbar and runtime:

### Sessions
- `POST /v2/sessions` - Create a new session
- `GET /v2/sessions` - List sessions, optionally `?projectFilter=...`
- `GET /v2/sessions/:id` - Get one session with annotations
- `PATCH /v2/sessions/:id` - Update session fields such as `projectId`

### Annotations
- `POST /v2/sessions/:id/annotations` - Add annotation
- `GET /v2/annotations/:id` - Get annotation
- `PATCH /v2/annotations/:id` - Update annotation fields or workflow status
- `DELETE /v2/annotations/:id` - Delete annotation
- `POST /v2/annotations/:id/thread` - Append a thread message
- `GET /v2/sessions/:id/pending` - Get pending annotations for one session
- `GET /v2/pending` - Get scoped pending annotations across sessions

### Events (SSE)
- `GET /v2/sessions/:id/events` - Session event stream with replay support
- `GET /v2/events` - Global event stream, optionally `?projectFilter=...`
- `GET /v2/agents/events?projectId=...` - Local agent status and dispatch events

### Local Agent Bridge

- `GET /v2/agents?projectId=...` - List local agents and current dispatch state
- `POST /v2/agents/select` - Select the active agent for a project
- `POST /v2/agents/connect` - Start or resume the active ACP agent session
- `POST /v2/agents/disconnect` - Disconnect the active ACP agent session
- `POST /v2/dispatch` - Send pending annotations to the active agent
- `POST /v2/dispatch/cancel` - Cancel the current agent turn

### MCP Transports

- `GET/POST/DELETE /mcp` - Streamable HTTP MCP transport
- `GET /sse` and `POST /messages?sessionId=...` - Legacy SSE MCP transport

### Health
- `GET /health` - Health check
- `GET /status` - Server status

## Hands-Free Mode

Use `agentation_v2_watch_annotations` in a loop for automatic feedback processing:

1. Agent calls `agentation_v2_watch_annotations` with a `projectFilter` or `sessionId`
2. Pending annotations arrive and are returned as a scoped batch
3. Agent processes each annotation:
   - `agentation_v2_acknowledge` -- mark as seen
   - Make code changes
   - `agentation_v2_resolve` -- mark as done with summary
4. Agent calls `agentation_v2_watch_annotations` again (loop)

Example CLAUDE.md instructions:

```markdown
When I say "watch mode", call agentation_v2_watch_annotations in a loop.
Scope the read with projectFilter unless I gave you a sessionId.
For each annotation: acknowledge it, make the fix, then resolve it with a summary.
Continue watching until I say stop or timeout is reached.
```

## Webhooks

Webhooks are now a compatibility path. Prefer the built-in local ACP agent bridge first; only use webhook forwarding when you need to notify external automation:

```bash
# Single webhook
export AGENTATION_WEBHOOK_URL=https://your-server.com/webhook

# Multiple webhooks (comma-separated)
export AGENTATION_WEBHOOKS=https://server1.com/hook,https://server2.com/hook
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTATION_STORE` | Storage backend (`memory` or `sqlite`) | `sqlite` |
| `AGENTATION_WEBHOOK_URL` | Single webhook URL | - |
| `AGENTATION_WEBHOOKS` | Comma-separated webhook URLs | - |
| `AGENTATION_EVENT_RETENTION_DAYS` | Days to keep events | `7` |

## Programmatic Usage

```typescript
import { startHttpServer, startMcpServer } from "agentation-vue-mcp"

// Start the unified local companion on port 4748
startHttpServer(4748)

// Start MCP stdio transport against the same API base URL
await startMcpServer("http://localhost:4748")
```

## Storage

By default, data is persisted to SQLite at `~/.agentation/store.db`. To use in-memory storage:

```bash
AGENTATION_STORE=memory agentation-vue-mcp server
```

## License

PolyForm Shield 1.0.0
