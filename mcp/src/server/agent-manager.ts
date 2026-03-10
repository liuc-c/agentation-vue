import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  filterSessionsByProject,
} from "./project-scope.js";
import {
  getPendingAnnotationsV2,
  getSession,
  getSessionWithAnnotationsV2,
  listSessions,
} from "./store.js";
import {
  loadAgentCatalog,
  type AgentCatalog,
  type AgentKind,
  type AgentStatus,
  type ResolvedAgentConfig,
} from "./agent-config.js";
import {
  AcpClient,
  type AcpInitializeResult,
  type McpServerConfig,
} from "./acp-client.js";
import type { AnnotationV2, Session } from "../types.js";

export interface AgentSummary {
  id: string
  label: string
  kind: AgentKind
  icon?: string
  description?: string
  homepage?: string
  installHint?: string
  available: boolean
  status: AgentStatus
  isDefault: boolean
  isActive: boolean
  lastError?: string
}

export interface AgentDispatchState {
  projectId: string;
  agentId?: string;
  mode: "auto" | "manual";
  trigger: "annotation.upsert" | "manual.send";
  state: "idle" | "sending" | "succeeded" | "failed" | "cancelled" | "skipped";
  message?: string;
  updatedAt: string;
}

export interface AgentEvent {
  type: "list" | "status" | "dispatch" | "error";
  projectId?: string;
  agents?: AgentSummary[];
  agent?: AgentSummary;
  dispatch?: AgentDispatchState;
  message?: string;
  timestamp: string;
}

export interface AgentManagerOptions {
  httpBaseUrl: string;
  configPath?: string;
  spawnImpl?: typeof spawn;
}

interface AgentRuntime {
  config: ResolvedAgentConfig
  client: AcpClient
  sessionId?: string
  initialized: boolean
  capabilities?: AcpInitializeResult["agentCapabilities"]
  status: AgentStatus
  lastError?: string
  lastAgentText?: string
  disposeUpdateSubscription?: () => void
}

function nowIso(): string {
  return new Date().toISOString();
}

function isLoadSessionSupported(capabilities: AcpInitializeResult["agentCapabilities"] | undefined): boolean {
  return Boolean(capabilities?.loadSession);
}

function truncateMessage(value: string | undefined, limit = 280): string | undefined {
  if (!value) return undefined;
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function getProjectRootFromSession(session: Session | undefined): string | undefined {
  const candidate = session?.metadata && typeof session.metadata === "object"
    ? (session.metadata as Record<string, unknown>).localProjectRoot
    : undefined;

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function resolveMcpCliPath(): string {
  const argvCli = process.argv[1] ? resolve(process.argv[1]) : null;
  const currentDir = typeof __dirname === "string"
    ? __dirname
    : argvCli
      ? dirname(argvCli)
      : resolve(process.cwd(), "mcp", "src", "server");
  const candidates = [
    resolve(currentDir, "../cli.js"),
    resolve(currentDir, "../cli.ts"),
    resolve(process.cwd(), "mcp", "dist", "cli.js"),
    resolve(process.cwd(), "mcp", "src", "cli.ts"),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error("Could not resolve agentation-vue-mcp CLI path");
  }

  return match;
}

function buildMcpServerConfig(httpBaseUrl: string): McpServerConfig {
  return {
    name: "agentation",
    command: process.execPath,
    args: [
      resolveMcpCliPath(),
      "server",
      "--mcp-only",
      "--http-url",
      httpBaseUrl,
    ],
    env: [],
  };
}

function buildPrompt(input: {
  projectId: string;
  mode: "auto" | "manual";
  trigger: "annotation.upsert" | "manual.send";
  annotations: AnnotationV2[];
  sessions: Session[];
}): string {
  const annotationSummary = input.annotations.map((annotation, index) => {
    const file = annotation.source.file;
    const line = annotation.source.line ? `:${annotation.source.line}` : "";
    const area = annotation.metadata && typeof annotation.metadata === "object"
      ? (annotation.metadata as Record<string, unknown>).project_area
      : undefined;
    const hints = annotation.metadata && typeof annotation.metadata === "object"
      ? (annotation.metadata as Record<string, unknown>).context_hints
      : undefined;
    const hintText = Array.isArray(hints) && hints.length > 0
      ? `\n   Hints: ${hints.join("; ")}`
      : "";

    return `${index + 1}. ${annotation.comment}
   Selector: ${annotation.elementSelector}
   Source: ${file}${line}
   URL: ${annotation.url}${area ? `\n   Area: ${String(area)}` : ""}${hintText}`;
  }).join("\n\n");

  const sessionSummary = input.sessions.map((session) => {
    const root = getProjectRootFromSession(session);
    return `- ${session.id} ${session.url}${root ? ` (root: ${root})` : ""}`;
  }).join("\n");

  return [
    "You are handling Agentation visual annotations for a local project.",
    "Use the provided Agentation MCP tools to inspect, acknowledge, and resolve the work.",
    "Recommended workflow:",
    "1. Read the relevant context with agentation_v2_get_session or agentation_v2_get_pending.",
    "2. Mark each item acknowledged before you start working.",
    "3. Make the requested code changes in the project working directory.",
    "4. Resolve each annotation with a short summary when done.",
    "",
    `Project: ${input.projectId}`,
    `Mode: ${input.mode}`,
    `Trigger: ${input.trigger}`,
    "",
    "Sessions in scope:",
    sessionSummary || "- none",
    "",
    "Pending annotations:",
    annotationSummary,
    "",
    "Raw pending annotations JSON:",
    JSON.stringify(input.annotations, null, 2),
  ].join("\n");
}

export class AgentManager {
  private readonly httpBaseUrl: string;
  private readonly configPath?: string;
  private readonly spawnImpl: typeof spawn;
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly activeAgentByProject = new Map<string, string>();
  private readonly runtimes = new Map<string, AgentRuntime>();
  private readonly dispatchStateByProject = new Map<string, AgentDispatchState>();

  private catalog: AgentCatalog | null = null;

  constructor(options: AgentManagerOptions) {
    this.httpBaseUrl = options.httpBaseUrl.replace(/\/+$/, "");
    this.configPath = options.configPath;
    this.spawnImpl = options.spawnImpl ?? spawn;
  }

  private emit(event: Omit<AgentEvent, "timestamp">): void {
    const fullEvent: AgentEvent = {
      ...event,
      timestamp: nowIso(),
    };

    for (const listener of this.listeners) {
      listener(fullEvent);
    }
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private getCatalog(): AgentCatalog {
    this.catalog = loadAgentCatalog(this.configPath);
    return this.catalog;
  }

  private getEffectiveAgentId(projectId: string): string | undefined {
    const explicit = this.activeAgentByProject.get(projectId);
    if (explicit) return explicit;

    const catalog = this.getCatalog();
    const defaultAgent = catalog.defaultAgentId
      ? catalog.agents.find((agent) => agent.id === catalog.defaultAgentId && agent.available)
      : undefined;
    if (defaultAgent) return defaultAgent.id;

    return catalog.agents.find((agent) => agent.available)?.id;
  }

  private runtimeKey(projectId: string, agentId: string): string {
    return `${projectId}::${agentId}`;
  }

  private summarizeAgent(projectId: string, config: ResolvedAgentConfig): AgentSummary {
    const runtime = this.runtimes.get(this.runtimeKey(projectId, config.id));
    const status = runtime?.status ?? config.status;
    const lastError = runtime?.lastError ?? config.lastError;
    const catalog = this.getCatalog();
    return {
      id: config.id,
      label: config.label,
      kind: config.kind,
      icon: config.icon,
      description: config.description,
      homepage: config.homepage,
      installHint: config.installHint,
      available: config.available,
      status,
      isDefault: config.id === catalog.defaultAgentId,
      isActive: config.id === this.getEffectiveAgentId(projectId),
      ...(lastError ? { lastError } : {}),
    };
  }

  private buildAgentList(projectId: string): AgentSummary[] {
    const catalog = this.getCatalog();
    return catalog.agents.map((agent) => this.summarizeAgent(projectId, agent));
  }

  listAgents(projectId: string): AgentSummary[] {
    const agents = this.buildAgentList(projectId);
    this.emit({
      type: "list",
      projectId,
      agents,
    });
    return agents;
  }

  getAvailableAgentCount(): number {
    return this.getCatalog().agents.filter((agent) => agent.available).length;
  }

  getDispatchState(projectId: string): AgentDispatchState | undefined {
    return this.dispatchStateByProject.get(projectId);
  }

  private updateDispatchState(
    projectId: string,
    state: Omit<AgentDispatchState, "projectId" | "updatedAt">,
  ): AgentDispatchState {
    const next: AgentDispatchState = {
      projectId,
      updatedAt: nowIso(),
      ...state,
    };
    this.dispatchStateByProject.set(projectId, next);
    this.emit({
      type: "dispatch",
      projectId,
      dispatch: next,
    });
    return next;
  }

  selectAgent(projectId: string, agentId: string): AgentSummary[] {
    const catalog = this.getCatalog();
    const target = catalog.agents.find((agent) => agent.id === agentId);
    if (!target) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    if (!target.available) {
      throw new Error(`Agent is not available on this machine: ${agentId}`);
    }

    this.activeAgentByProject.set(projectId, agentId);
    return this.listAgents(projectId);
  }

  private resolveAgentConfig(agentId: string): ResolvedAgentConfig {
    const catalog = this.getCatalog();
    const target = catalog.agents.find((agent) => agent.id === agentId);
    if (!target) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    return target;
  }

  private resolveProjectRoot(projectId: string, sessionId?: string): string {
    if (sessionId) {
      const root = getProjectRootFromSession(getSession(sessionId));
      if (root) return root;
    }

    const sessions = filterSessionsByProject(listSessions(), projectId);
    const rootedSession = sessions.find((session) => Boolean(getProjectRootFromSession(session)));
    return getProjectRootFromSession(rootedSession) || process.cwd();
  }

  private createRuntime(projectId: string, config: ResolvedAgentConfig): AgentRuntime {
    const projectRoot = this.resolveProjectRoot(projectId);
    const client = new AcpClient({
      command: config.resolvedCommand,
      args: config.args,
      env: Object.fromEntries(config.env.map((entry) => [entry.name, entry.value])),
      cwd: projectRoot,
      spawnImpl: this.spawnImpl,
    });

    const runtime: AgentRuntime = {
      config,
      client,
      initialized: false,
      status: "connecting",
    };

    runtime.disposeUpdateSubscription = client.subscribe((notification) => {
      const update = notification.update;
      if (!update || typeof update !== "object") return;

      const sessionUpdate = (update as Record<string, unknown>).sessionUpdate;
      if (sessionUpdate === "agent_message_chunk") {
        const content = (update as Record<string, unknown>).content;
        if (content && typeof content === "object") {
          const text = (content as Record<string, unknown>).text;
          if (typeof text === "string" && text.trim()) {
            runtime.lastAgentText = `${runtime.lastAgentText ?? ""}${text}`;
          }
        }
      }

      if (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update") {
        runtime.lastAgentText = truncateMessage(runtime.lastAgentText);
      }
    });

    return runtime;
  }

  private async ensureRuntime(projectId: string, agentId?: string): Promise<AgentRuntime> {
    const targetAgentId = agentId ?? this.getEffectiveAgentId(projectId);
    if (!targetAgentId) {
      throw new Error("No available agent configured");
    }

    const config = this.resolveAgentConfig(targetAgentId);
    if (!config.available) {
      throw new Error(`Agent is not available on this machine: ${targetAgentId}`);
    }

    const key = this.runtimeKey(projectId, targetAgentId);
    const existing = this.runtimes.get(key);
    if (existing && existing.status !== "error") return existing;
    if (existing && existing.status === "error") {
      existing.disposeUpdateSubscription?.();
      await existing.client.close();
      this.runtimes.delete(key);
    }

    const runtime = this.createRuntime(projectId, config);
    this.runtimes.set(key, runtime);

    try {
      await runtime.client.start();
      const initResult = await runtime.client.initialize();
      runtime.initialized = true;
      runtime.capabilities = initResult.agentCapabilities;
      runtime.status = "connecting";

      const mcpServers = [buildMcpServerConfig(this.httpBaseUrl)];
      const cwd = this.resolveProjectRoot(projectId);

      const created = await runtime.client.createSession(cwd, mcpServers);
      runtime.sessionId = created.sessionId;
      runtime.status = "ready";
      runtime.lastError = undefined;
      this.emit({
        type: "status",
        projectId,
        agent: this.summarizeAgent(projectId, config),
      });
      return runtime;
    } catch (error) {
      runtime.status = "error";
      runtime.lastError = (error as Error).message;
      this.emit({
        type: "error",
        projectId,
        message: runtime.lastError,
        agent: this.summarizeAgent(projectId, config),
      });
      throw error;
    }
  }

  async connect(projectId: string, agentId?: string): Promise<AgentSummary[]> {
    const runtime = await this.ensureRuntime(projectId, agentId);
    runtime.status = "ready";
    return this.listAgents(projectId);
  }

  async disconnect(projectId: string, agentId?: string): Promise<AgentSummary[]> {
    const targetAgentId = agentId ?? this.getEffectiveAgentId(projectId);
    if (!targetAgentId) {
      return this.listAgents(projectId);
    }

    const key = this.runtimeKey(projectId, targetAgentId);
    const runtime = this.runtimes.get(key);
    if (runtime) {
      runtime.disposeUpdateSubscription?.();
      await runtime.client.close();
      this.runtimes.delete(key);
    }

    return this.listAgents(projectId);
  }

  private collectSessions(projectId: string, sessionId?: string): Session[] {
    if (sessionId) {
      const session = getSession(sessionId);
      return session ? [session] : [];
    }

    return filterSessionsByProject(listSessions(), projectId);
  }

  private collectPendingAnnotations(projectId: string, sessionId?: string): AnnotationV2[] {
    if (sessionId) {
      return getPendingAnnotationsV2(sessionId);
    }

    const sessions = filterSessionsByProject(listSessions(), projectId);
    return sessions.flatMap((session) => getPendingAnnotationsV2(session.id));
  }

  async dispatch(params: {
    projectId: string;
    mode: "auto" | "manual";
    trigger: "annotation.upsert" | "manual.send";
    sessionId?: string;
  }): Promise<AgentDispatchState> {
    const agentId = this.getEffectiveAgentId(params.projectId);
    if (!agentId) {
      throw new Error("No active agent configured for this project");
    }

    const annotations = this.collectPendingAnnotations(params.projectId, params.sessionId);
    if (annotations.length === 0) {
      return this.updateDispatchState(params.projectId, {
        agentId,
        mode: params.mode,
        trigger: params.trigger,
        state: "skipped",
        message: "No pending annotations to send",
      });
    }

    const sessions = this.collectSessions(params.projectId, params.sessionId);
    const runtime = await this.ensureRuntime(params.projectId, agentId);
    if (!runtime.sessionId) {
      throw new Error("Agent session was not established");
    }

    runtime.status = "busy";
    runtime.lastAgentText = "";
    this.emit({
      type: "status",
      projectId: params.projectId,
      agent: this.summarizeAgent(params.projectId, runtime.config),
    });

    this.updateDispatchState(params.projectId, {
      agentId,
      mode: params.mode,
      trigger: params.trigger,
      state: "sending",
      message: "Dispatching annotations to agent",
    });

    try {
      const prompt = buildPrompt({
        projectId: params.projectId,
        mode: params.mode,
        trigger: params.trigger,
        annotations,
        sessions,
      });
      const result = await runtime.client.prompt(runtime.sessionId, prompt);
      runtime.status = "ready";

      const message = truncateMessage(runtime.lastAgentText) || result.stopReason || "Turn completed";
      return this.updateDispatchState(params.projectId, {
        agentId,
        mode: params.mode,
        trigger: params.trigger,
        state: "succeeded",
        message,
      });
    } catch (error) {
      runtime.status = "error";
      runtime.lastError = (error as Error).message;
      return this.updateDispatchState(params.projectId, {
        agentId,
        mode: params.mode,
        trigger: params.trigger,
        state: "failed",
        message: runtime.lastError,
      });
    } finally {
      this.emit({
        type: "status",
        projectId: params.projectId,
        agent: this.summarizeAgent(params.projectId, runtime.config),
      });
    }
  }

  async cancelDispatch(projectId: string): Promise<AgentDispatchState | undefined> {
    const agentId = this.getEffectiveAgentId(projectId);
    if (!agentId) return undefined;

    const runtime = this.runtimes.get(this.runtimeKey(projectId, agentId));
    if (!runtime?.sessionId) return undefined;

    await runtime.client.cancel(runtime.sessionId);
    runtime.status = "ready";

    return this.updateDispatchState(projectId, {
      agentId,
      mode: "manual",
      trigger: "manual.send",
      state: "cancelled",
      message: "Cancelled current agent turn",
    });
  }

  async dispose(): Promise<void> {
    const runtimes = [...this.runtimes.values()];
    this.runtimes.clear();
    await Promise.all(runtimes.map(async (runtime) => {
      runtime.disposeUpdateSubscription?.();
      await runtime.client.close();
    }));
  }
}
