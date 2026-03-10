/**
 * Agentation MCP CLI
 *
 * Usage:
 *   agentation-vue-mcp server [--port 4748]
 *   agentation-vue-mcp init
 *   agentation-vue-mcp doctor
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const command = process.argv[2];

async function runAgentsInit() {
  const { getAgentConfigPath, loadAgentCatalog, writeAgentCatalogConfig } = await import("./server/agent-config.js");
  const catalog = loadAgentCatalog();
  writeAgentCatalogConfig(catalog);

  console.log(`✓ Wrote agent catalog to ${getAgentConfigPath()}`);
  console.log(`  Snapshot source: ${catalog.snapshotSource ?? "embedded"}`);
  for (const agent of catalog.agents) {
    console.log(`  - ${agent.label}: ${agent.available ? "available" : "missing"} (${agent.resolvedCommand})`);
  }
}

async function runAgentsList() {
  const { loadAgentCatalog } = await import("./server/agent-config.js");
  const catalog = loadAgentCatalog();

  console.log(JSON.stringify({
    configPath: catalog.configPath,
    source: catalog.source,
    snapshotSource: catalog.snapshotSource,
    snapshotGeneratedAt: catalog.snapshotGeneratedAt,
    defaultAgentId: catalog.defaultAgentId,
    agents: catalog.agents.map((agent) => ({
      id: agent.id,
      label: agent.label,
      kind: agent.kind,
      icon: agent.icon,
      description: agent.description,
      homepage: agent.homepage,
      installHint: agent.installHint,
      available: agent.available,
      command: agent.resolvedCommand,
      status: agent.status,
    })),
  }, null, 2));
}

async function runAgentsDoctor() {
  const { getAgentConfigPath, loadAgentCatalog } = await import("./server/agent-config.js");
  const catalog = loadAgentCatalog();

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                  Agentation Agent Doctor                      ║
╚═══════════════════════════════════════════════════════════════╝
`);
  console.log(`Config path: ${getAgentConfigPath()}`);
  console.log(`Registry source: ${catalog.snapshotSource ?? "embedded snapshot"}`);
  console.log(`Snapshot generated: ${catalog.snapshotGeneratedAt ?? "unknown"}`);
  console.log(`Default agent: ${catalog.defaultAgentId ?? "(none)"}`);
  console.log();

  for (const agent of catalog.agents) {
    const icon = agent.available ? "✓" : "○";
    console.log(`${icon} ${agent.label} (${agent.kind})`);
    console.log(`  command: ${agent.resolvedCommand}`);
    console.log(`  status: ${agent.available ? "available" : "missing"}`);
    if (agent.installHint) {
      console.log(`  install: ${agent.installHint}`);
    }
  }
}

// ============================================================================
// INIT COMMAND - Interactive setup wizard
// ============================================================================

async function runInit() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                 Agentation MCP Setup Wizard                    ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Step 1: Check Claude Code config
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  const hasClaudeConfig = fs.existsSync(claudeConfigPath);

  if (hasClaudeConfig) {
    console.log(`✓ Found Claude Code config at ${claudeConfigPath}`);
  } else {
    console.log(`○ No Claude Code config found at ${claudeConfigPath}`);
  }
  console.log();

  // Step 2: Ask about MCP server
  console.log(`The Agentation MCP server allows Claude Code to receive`);
  console.log(`real-time annotations and respond to feedback.`);
  console.log();

  const setupMcp = await question(`Set up MCP server integration? [Y/n] `);
  const wantsMcp = setupMcp.toLowerCase() !== "n";

  if (wantsMcp) {
    let port = 4748;
    const portAnswer = await question(`Companion server port [4748]: `);
    if (portAnswer && !isNaN(parseInt(portAnswer, 10))) {
      port = parseInt(portAnswer, 10);
    }

    // Register MCP server using claude mcp add
    const mcpArgs = port === 4748
      ? ["mcp", "add", "agentation", "--", "npx", "agentation-vue-mcp", "server"]
      : ["mcp", "add", "agentation", "--", "npx", "agentation-vue-mcp", "server", "--port", String(port)];

    console.log();
    console.log(`Running: claude ${mcpArgs.join(" ")}`);

    try {
      const result = spawn("claude", mcpArgs, { stdio: "inherit" });
      await new Promise<void>((resolve, reject) => {
        result.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`claude mcp add exited with code ${code}`));
        });
        result.on("error", reject);
      });
      console.log(`✓ Registered agentation MCP server with Claude Code`);
    } catch (err) {
      console.log(`✗ Could not register MCP server automatically: ${err}`);
      console.log(`  You can register manually by running:`);
      console.log(`  claude mcp add agentation -- npx agentation-vue-mcp server`);
    }
    console.log();

    // Test connection
    const testNow = await question(`Start server and test connection? [Y/n] `);
    if (testNow.toLowerCase() !== "n") {
      console.log();
      console.log(`Starting server on port ${port}...`);

      // Start server in background
      const server = spawn("agentation-vue-mcp", ["server", "--port", String(port)], {
        stdio: "inherit",
        detached: false,
      });

      // Wait a moment for server to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test health endpoint
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          console.log();
          console.log(`✓ Server is running on http://localhost:${port}`);
          console.log(`✓ MCP tools available to Claude Code`);
          console.log();
          console.log(`Press Ctrl+C to stop the server.`);

          // Keep running
          await new Promise(() => {});
        } else {
          console.log(`✗ Server health check failed: ${response.status}`);
          server.kill();
        }
      } catch (err) {
        console.log(`✗ Could not connect to server: ${err}`);
        server.kill();
      }
    }
  }

  console.log();
  console.log(`Setup complete! Run 'agentation-vue-mcp doctor' to verify your setup.`);
  rl.close();
}

// ============================================================================
// DOCTOR COMMAND - Diagnostic checks
// ============================================================================

async function runDoctor() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Agentation MCP Doctor                       ║
╚═══════════════════════════════════════════════════════════════╝
`);

  let allPassed = true;
  const results: Array<{ name: string; status: "pass" | "fail" | "warn"; message: string }> = [];

  // Check 1: Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (majorVersion >= 18) {
    results.push({ name: "Node.js", status: "pass", message: `${nodeVersion} (18+ required)` });
  } else {
    results.push({ name: "Node.js", status: "fail", message: `${nodeVersion} (18+ required)` });
    allPassed = false;
  }

  // Check 2: Claude Code config
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  if (fs.existsSync(claudeConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudeConfigPath, "utf-8"));
      // Check top-level and per-project mcpServers for agentation
      let found = false;
      if (config.mcpServers?.agentation) {
        found = true;
      }
      // Also check per-project entries
      if (!found && config.projects) {
        for (const proj of Object.values(config.projects) as Record<string, unknown>[]) {
          if ((proj as { mcpServers?: { agentation?: unknown } }).mcpServers?.agentation) {
            found = true;
            break;
          }
        }
      }
      if (found) {
        results.push({ name: "Claude Code config", status: "pass", message: "MCP server configured" });
      } else {
        results.push({ name: "Claude Code config", status: "warn", message: "Config exists but no agentation MCP entry. Run: claude mcp add agentation -- npx agentation-vue-mcp server" });
      }
    } catch {
      results.push({ name: "Claude Code config", status: "fail", message: "Could not parse config file" });
      allPassed = false;
    }
  } else {
    results.push({ name: "Claude Code config", status: "warn", message: "No config found at ~/.claude.json. Run: claude mcp add agentation -- npx agentation-vue-mcp server" });
  }

  // Check 3: Stale config at old (wrong) path
  const oldConfigPath = path.join(homeDir, ".claude", "claude_code_config.json");
  if (fs.existsSync(oldConfigPath)) {
    results.push({ name: "Stale config", status: "warn", message: `${oldConfigPath} exists but Claude Code doesn't read this file. Safe to delete.` });
  }

  // Check 4: Server connectivity (try default port)
  try {
    const response = await fetch("http://localhost:4748/health", { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      results.push({ name: "Server (port 4748)", status: "pass", message: "Running and healthy" });
    } else {
      results.push({ name: "Server (port 4748)", status: "warn", message: `Responded with ${response.status}` });
    }
  } catch {
    results.push({ name: "Server (port 4748)", status: "warn", message: "Not running (start with: agentation-vue-mcp server)" });
  }

  // Print results
  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
    const color = r.status === "pass" ? "\x1b[32m" : r.status === "fail" ? "\x1b[31m" : "\x1b[33m";
    console.log(`${color}${icon}\x1b[0m ${r.name}: ${r.message}`);
  }

  console.log();
  if (allPassed) {
    console.log(`All checks passed!`);
  } else {
    console.log(`Some checks failed. Run 'agentation-vue-mcp init' to fix.`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND ROUTER
// ============================================================================

if (command === "init") {
  runInit().catch((err) => {
    console.error("Init failed:", err);
    process.exit(1);
  });
} else if (command === "doctor") {
  runDoctor().catch((err) => {
    console.error("Doctor failed:", err);
    process.exit(1);
  });
} else if (command === "agents") {
  const subcommand = process.argv[3] || "list";

  const runner = subcommand === "init"
    ? runAgentsInit
    : subcommand === "doctor"
      ? runAgentsDoctor
      : runAgentsList;

  runner().catch((err) => {
    console.error(`agents ${subcommand} failed:`, err);
    process.exit(1);
  });
} else if (command === "server") {
  // Dynamic import to avoid loading server code for other commands
  import("./server/index.js").then((serverModule) => {
    const { startHttpServer, startMcpServer, setApiKey } = serverModule;
    const args = process.argv.slice(3);
    let port = 4748;
    let mcpOnly = false;
    let httpUrl = "http://localhost:4748";
    let apiKeyArg: string | undefined;
    let noStdio = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--port" && args[i + 1]) {
        const parsed = parseInt(args[i + 1], 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
          port = parsed;
          if (!args.includes("--http-url")) {
            httpUrl = `http://localhost:${port}`;
          }
        }
        i++;
      }
      if (args[i] === "--mcp-only") {
        mcpOnly = true;
      }
      if (args[i] === "--no-stdio") {
        noStdio = true;
      }
      if (args[i] === "--http-url" && args[i + 1]) {
        httpUrl = args[i + 1];
        i++;
      }
      if (args[i] === "--api-key" && args[i + 1]) {
        apiKeyArg = args[i + 1];
        i++;
      }
    }

    // API key from flag or environment variable
    const apiKey = apiKeyArg || process.env.AGENTATION_API_KEY;
    if (apiKey) {
      setApiKey(apiKey);
    }

    if (!mcpOnly) {
      startHttpServer(port, apiKey);
    }

    if (noStdio) {
      return;
    }

    startMcpServer(httpUrl).catch((err) => {
      console.error("MCP server error:", err);
      process.exit(1);
    });
  });
} else if (command === "help" || command === "--help" || command === "-h" || !command) {
  console.log(`
agentation-vue-mcp - MCP server for Agentation visual feedback

Usage:
  agentation-vue-mcp init                    Interactive setup wizard
  agentation-vue-mcp agents [list|init|doctor]
  agentation-vue-mcp server [options]        Start the annotation server
  agentation-vue-mcp doctor                  Check your setup and diagnose issues
  agentation-vue-mcp help                    Show this help message

Server Options:
  --port <port>      Unified companion port for API + /mcp + /sse (default: 4748)
  --mcp-only         Skip the local HTTP companion and only expose stdio MCP
  --http-url <url>   Agentation API base URL for MCP tools to fetch from
  --api-key <key>    API key for cloud storage (or set AGENTATION_API_KEY env var)
  --no-stdio         Disable stdio MCP transport

Commands:
  init      Guided setup that configures Claude Code to use the MCP server.
            Registers the server via 'claude mcp add'.

  agents    Manage the local ACP/CLI bridge catalog:
            - list   Print detected/configured agents as JSON
            - init   Write ~/.agentation/agents.json from the embedded snapshot catalog
            - doctor Show current local agent availability

  server    Starts the unified Agentation companion on one port.
            Browser/plugin sync uses /v2/* on that port.
            MCP clients can connect over streamable HTTP (/mcp), SSE (/sse),
            or stdio unless --no-stdio is passed.

  doctor    Runs diagnostic checks on your setup:
            - Node.js version
            - Claude Code configuration
            - Server connectivity

Examples:
  agentation-vue-mcp init                Set up Agentation MCP
  agentation-vue-mcp agents init         Write a starter ACP agent catalog
  agentation-vue-mcp agents doctor       Inspect local agent availability
  agentation-vue-mcp server                                 Start unified companion on 4748
  agentation-vue-mcp server --port 8080                    Override the companion port
  agentation-vue-mcp server --no-stdio                     HTTP-only MCP transport
  agentation-vue-mcp doctor              Check if everything is configured correctly

  # Use cloud storage with API key (local server proxies to cloud)
  agentation-vue-mcp server --api-key ag_xxx

  # Or using environment variable
  AGENTATION_API_KEY=ag_xxx agentation-vue-mcp server
`);
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Run 'agentation-vue-mcp help' for usage information.");
  process.exit(1);
}
