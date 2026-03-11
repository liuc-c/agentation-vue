import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  filterSessionsByProject,
} from "./project-scope.js";
import { eventBus } from "./events.js";
import {
  claimAnnotationV2,
  releaseAnnotationV2,
  requeueExpiredProcessingAnnotationsV2,
  getPendingAnnotationsV2,
  getSession,
  listSessions,
  updateSessionProjectId,
} from "./store.js";
import {
  loadAgentCatalog,
  type AgentAvailability,
  type AgentCatalog,
  type AgentKind,
  type AgentStatus,
  type ResolvedAgentConfig,
} from "./agent-config.js";
import {
  AcpRuntime,
  type AcpInitializeResult,
  type McpServerConfig,
} from "./acp-runtime.js";
import type { AnnotationV2, Session } from "../types.js";

export interface AgentSummary {
  id: string
  label: string
  kind: AgentKind
  icon?: string
  description?: string
  homepage?: string
  installHint?: string
  availability: AgentAvailability
  available: boolean
  status: AgentStatus
  isDefault: boolean
  isActive: boolean
  lastError?: string
}

export interface AgentDispatchState {
  projectId: string;
  agentId?: string;
  runId?: string;
  mode: "auto" | "manual";
  trigger: "annotation.upsert" | "manual.send";
  state: "idle" | "queued" | "sending" | "succeeded" | "failed" | "cancelled" | "skipped";
  claimedCount?: number;
  completedCount?: number;
  queuePosition?: number;
  currentAnnotationId?: string;
  message?: string;
  updatedAt: string;
}

export interface AgentEvent {
  type:
    | "list"
    | "status"
    | "dispatch"
    | "dispatch.queued"
    | "dispatch.started"
    | "dispatch.progress"
    | "dispatch.annotation.completed"
    | "dispatch.completed"
    | "dispatch.failed"
    | "dispatch.cancelled"
    | "dispatch.skipped"
    | "error";
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
  client: AcpRuntime
  sessionId?: string
  initialized: boolean
  capabilities?: AcpInitializeResult["agentCapabilities"]
  status: AgentStatus
  lastError?: string
  lastAgentText?: string
  lastProgressMessage?: string
  disposeUpdateSubscription?: () => void
}

interface DispatchRequest {
  runId: string
  projectId: string
  agentId: string
  mode: "auto" | "manual"
  trigger: "annotation.upsert" | "manual.send"
  sessionIds?: string[]
}

interface QueuedDispatchRun extends DispatchRequest {
  queuedAt: string
}

interface PendingDispatchRun extends DispatchRequest {
  annotationIds: string[]
  completedAnnotationIds: Set<string>
  cancelRequested: boolean
  currentAnnotationId?: string
}

const PROCESSING_TTL_SECONDS = 600

function nowIso(): string {
  return new Date().toISOString();
}

function truncateMessage(value: string | undefined, limit = 280): string | undefined {
  if (!value) return undefined;
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function normalizeSessionIds(sessionId?: string): string[] | undefined {
  const trimmed = sessionId?.trim()
  return trimmed ? [trimmed] : undefined
}

function mergeSessionIds(
  current?: string[],
  incoming?: string[],
): string[] | undefined {
  if (!current || !incoming) {
    return undefined
  }

  return [...new Set([...current, ...incoming])]
}

function getProjectRootFromSession(session: Session | undefined): string | undefined {
  const candidate = session?.metadata && typeof session.metadata === "object"
    ? (session.metadata as Record<string, unknown>).localProjectRoot
    : undefined;

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function isDispatchableSession(session: Pick<Session, "status">): boolean {
  return session.status !== "closed";
}

function buildSessionAgentMetadata(
  config: Pick<ResolvedAgentConfig, "id" | "label" | "kind">,
  runId: string,
): Record<string, unknown> {
  return {
    agentationLastAgentId: config.id,
    agentationLastAgentLabel: config.label,
    agentationLastAgentKind: config.kind,
    agentationLastRunId: runId,
    agentationLastAgentAt: nowIso(),
  };
}

export function resolveMcpCliPath(options: {
  argvCli?: string | null;
  currentDir?: string | null;
  cwd?: string;
} = {}): string {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const argvCli = Object.prototype.hasOwnProperty.call(options, "argvCli")
    ? (options.argvCli ? resolve(options.argvCli) : null)
    : process.argv[1]
      ? resolve(process.argv[1])
      : null;
  const currentDir = Object.prototype.hasOwnProperty.call(options, "currentDir")
    ? (options.currentDir ? resolve(options.currentDir) : resolve(cwd, "mcp", "src", "server"))
    : typeof __dirname === "string"
      ? __dirname
      : argvCli
        ? dirname(argvCli)
        : resolve(cwd, "mcp", "src", "server");
  const candidates = [
    argvCli,
    resolve(currentDir, "cli.js"),
    resolve(currentDir, "cli.ts"),
    resolve(currentDir, "../cli.js"),
    resolve(currentDir, "../cli.ts"),
    resolve(cwd, "mcp", "dist", "cli.js"),
    resolve(cwd, "mcp", "src", "cli.ts"),
  ].filter((candidate): candidate is string => Boolean(candidate));

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
  agentId: string;
  runId: string;
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
    "Use the provided Agentation MCP tools to inspect, resolve, dismiss, or release the claimed work.",
    "Recommended workflow:",
    "1. These annotations are already claimed for this run and marked as processing.",
    "2. Read the relevant context with agentation_v2_get_session if you need more detail.",
    "3. Work through the claimed annotations one by one instead of batching them loosely.",
    "4. Make the requested code changes in the project working directory.",
    "5. As soon as you finish one annotation, call agentation_v2_resolve with a short summary before moving on.",
    "6. If an item is invalid, blocked, or out of scope, call dismiss or release it before ending the turn.",
    "7. Do not leave claimed annotations in processing when you finish the turn.",
    "",
    `Project: ${input.projectId}`,
    `Agent: ${input.agentId}`,
    `Run ID: ${input.runId}`,
    `Mode: ${input.mode}`,
    `Trigger: ${input.trigger}`,
    "",
    "Sessions in scope:",
    sessionSummary || "- none",
    "",
    "Claimed annotations for this run:",
    annotationSummary,
    "",
    "Raw claimed annotations JSON:",
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
  private readonly dispatchQueueByProject = new Map<string, QueuedDispatchRun[]>();
  private readonly activeDispatchRunByProject = new Map<string, PendingDispatchRun>();
  private readonly drainingProjects = new Set<string>();

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
      availability: config.availability,
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

  private getDispatchQueue(projectId: string): QueuedDispatchRun[] {
    return this.dispatchQueueByProject.get(projectId) ?? []
  }

  private setDispatchQueue(projectId: string, queue: QueuedDispatchRun[]): void {
    if (queue.length === 0) {
      this.dispatchQueueByProject.delete(projectId)
      return
    }

    this.dispatchQueueByProject.set(projectId, queue)
  }

  private queueDispatch(run: QueuedDispatchRun): { run: QueuedDispatchRun; merged: boolean; queuePosition: number } {
    const queue = [...this.getDispatchQueue(run.projectId)]

    if (run.mode === "auto") {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const queued = queue[index]
        if (queued.mode !== "auto") continue
        queued.sessionIds = mergeSessionIds(queued.sessionIds, run.sessionIds)
        this.setDispatchQueue(run.projectId, queue)
        return {
          run: queued,
          merged: true,
          queuePosition: index + 1,
        }
      }
    }

    if (run.mode === "manual") {
      const firstAutoIndex = queue.findIndex((entry) => entry.mode === "auto")
      if (firstAutoIndex === -1) {
        queue.push(run)
      } else {
        queue.splice(firstAutoIndex, 0, run)
      }
    } else {
      queue.push(run)
    }

    this.setDispatchQueue(run.projectId, queue)
    return {
      run,
      merged: false,
      queuePosition: queue.findIndex((entry) => entry.runId === run.runId) + 1,
    }
  }

  private dequeueDispatch(projectId: string): QueuedDispatchRun | undefined {
    const queue = [...this.getDispatchQueue(projectId)]
    const next = queue.shift()
    this.setDispatchQueue(projectId, queue)
    return next
  }

  private getNextQueuedDispatch(projectId: string): QueuedDispatchRun | undefined {
    return this.getDispatchQueue(projectId)[0]
  }

  private releaseClaimedAnnotations(
    annotationIds: string[],
    owner: { agentId: string; runId: string },
  ): void {
    for (const annotationId of annotationIds) {
      releaseAnnotationV2(annotationId, owner);
    }
  }

  private claimPendingAnnotations(
    projectId: string,
    agentId: string,
    runId: string,
    sessionIds?: string[],
  ): AnnotationV2[] {
    requeueExpiredProcessingAnnotationsV2();
    const candidates = this.collectPendingAnnotations(projectId, sessionIds);
    const startedAt = nowIso();
    const expiresAt = new Date(Date.now() + PROCESSING_TTL_SECONDS * 1000).toISOString();
    const claimed: AnnotationV2[] = [];

    for (const annotation of candidates) {
      const next = claimAnnotationV2(annotation.id, {
        agentId,
        runId,
        processingStartedAt: startedAt,
        processingExpiresAt: expiresAt,
      });
      if (next) {
        claimed.push(next);
      }
    }

    return claimed;
  }

  private updateDispatchState(
    projectId: string,
    state: Omit<AgentDispatchState, "projectId" | "updatedAt">,
    eventType: AgentEvent["type"] = "dispatch",
  ): AgentDispatchState {
    const next: AgentDispatchState = {
      projectId,
      updatedAt: nowIso(),
      ...state,
    };
    this.dispatchStateByProject.set(projectId, next);
    this.emit({
      type: eventType,
      projectId,
      dispatch: next,
    });
    return next;
  }

  private emitRuntimeProgress(projectId: string, runtime: AgentRuntime): void {
    const activeRun = this.activeDispatchRunByProject.get(projectId)
    if (!activeRun || activeRun.agentId !== runtime.config.id || activeRun.cancelRequested) {
      return
    }

    const message = truncateMessage(runtime.lastAgentText)
    if (!message || runtime.lastProgressMessage === message) {
      return
    }

    runtime.lastProgressMessage = message
    this.updateDispatchState(projectId, {
      agentId: activeRun.agentId,
      runId: activeRun.runId,
      mode: activeRun.mode,
      trigger: activeRun.trigger,
      state: "sending",
      claimedCount: activeRun.annotationIds.length,
      completedCount: activeRun.completedAnnotationIds.size,
      currentAnnotationId: activeRun.currentAnnotationId,
      message,
    }, "dispatch.progress")
  }

  private buildQueuedDispatchMessage(
    run: Pick<QueuedDispatchRun, "mode">,
    queuePosition: number,
    merged: boolean,
  ): string {
    const label = run.mode === "manual" ? "manual" : "auto"
    if (merged) {
      return `Merged new ${label} work into queued dispatch #${queuePosition}`
    }

    return `Queued ${label} dispatch #${queuePosition}`
  }

  private emitQueuedDispatchState(
    run: QueuedDispatchRun,
    queuePosition: number,
    merged: boolean,
  ): AgentDispatchState {
    return this.updateDispatchState(run.projectId, {
      agentId: run.agentId,
      runId: run.runId,
      mode: run.mode,
      trigger: run.trigger,
      state: "queued",
      queuePosition,
      message: this.buildQueuedDispatchMessage(run, queuePosition, merged),
    }, "dispatch.queued")
  }

  private subscribeToRunAnnotationUpdates(activeRun: PendingDispatchRun): () => void {
    return eventBus.subscribe((event) => {
      if (event.type !== "annotation.updated") return
      const payload = event.payload
      if (!payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") {
        return
      }
      if (!activeRun.annotationIds.includes(payload.id)) return

      const annotation = payload as AnnotationV2
      const status = annotation.status ?? "pending"
      if ((status !== "resolved" && status !== "dismissed") || activeRun.completedAnnotationIds.has(annotation.id)) {
        return
      }

      activeRun.completedAnnotationIds.add(annotation.id)
      activeRun.currentAnnotationId = activeRun.annotationIds.find(
        (annotationId) => !activeRun.completedAnnotationIds.has(annotationId),
      )

      const completedCount = activeRun.completedAnnotationIds.size
      const message = `Completed ${completedCount} of ${activeRun.annotationIds.length} annotations`
      this.updateDispatchState(activeRun.projectId, {
        agentId: activeRun.agentId,
        runId: activeRun.runId,
        mode: activeRun.mode,
        trigger: activeRun.trigger,
        state: "sending",
        claimedCount: activeRun.annotationIds.length,
        completedCount,
        currentAnnotationId: activeRun.currentAnnotationId,
        message,
      }, "dispatch.annotation.completed")
    })
  }

  private buildCompletionMessage(
    activeRun: PendingDispatchRun,
    agentText?: string,
    stopReason?: string,
  ): string {
    const completedCount = activeRun.completedAnnotationIds.size
    const claimedCount = activeRun.annotationIds.length
    const remainingCount = claimedCount - completedCount
    const summaryText = truncateMessage(agentText, 180)

    if (remainingCount <= 0) {
      return summaryText ?? `Completed ${claimedCount} annotation${claimedCount === 1 ? "" : "s"}`
    }

    const base = `Completed ${completedCount} of ${claimedCount} annotations`
    const suffix = `Returned ${remainingCount} unresolved annotation${remainingCount === 1 ? "" : "s"} to pending`
    if (summaryText) {
      return truncateMessage(`${base}. ${suffix}. ${summaryText}`, 280) ?? `${base}. ${suffix}`
    }

    return stopReason
      ? `${base}. ${suffix}. ${stopReason}`
      : `${base}. ${suffix}`
  }

  private scheduleDispatchDrain(projectId: string): void {
    if (this.drainingProjects.has(projectId)) {
      return
    }

    queueMicrotask(() => {
      void this.drainDispatchQueue(projectId)
    })
  }

  private recordSuccessfulDispatchSessions(
    config: Pick<ResolvedAgentConfig, "id" | "label" | "kind">,
    annotations: AnnotationV2[],
    runId: string,
  ): void {
    const sessionIds = [...new Set(
      annotations
        .map((annotation) => annotation.sessionId?.trim())
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    )];
    if (sessionIds.length === 0) return;

    const metadata = buildSessionAgentMetadata(config, runId);
    for (const sessionId of sessionIds) {
      updateSessionProjectId(sessionId, undefined, metadata);
    }
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
    const client = new AcpRuntime({
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
            this.emitRuntimeProgress(projectId, runtime);
          }
        }
      }

      if (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update") {
        runtime.lastAgentText = truncateMessage(runtime.lastAgentText);
        this.emitRuntimeProgress(projectId, runtime);
      }
    });

    return runtime;
  }

  private async establishRuntimeSession(projectId: string, runtime: AgentRuntime): Promise<void> {
    if (!runtime.client.isRunning()) {
      runtime.initialized = false;
      runtime.sessionId = undefined;
    }

    if (!runtime.initialized) {
      await runtime.client.start();
      const initResult = await runtime.client.initialize();
      runtime.initialized = true;
      runtime.capabilities = initResult.agentCapabilities;
    }

    if (runtime.sessionId) {
      return;
    }

    runtime.status = "connecting";
    const mcpServers = [buildMcpServerConfig(this.httpBaseUrl)];
    const cwd = this.resolveProjectRoot(projectId);
    const created = await runtime.client.newSession(cwd, mcpServers);
    if (!created.sessionId?.trim()) {
      throw new Error("Agent session was not established");
    }

    runtime.sessionId = created.sessionId;
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
    if (existing && existing.status !== "error") {
      try {
        await this.establishRuntimeSession(projectId, existing);
        existing.status = existing.status === "busy" ? "busy" : "ready";
        existing.lastError = undefined;
        this.emit({
          type: "status",
          projectId,
          agent: this.summarizeAgent(projectId, config),
        });
        return existing;
      } catch (error) {
        existing.status = "error";
        existing.lastError = (error as Error).message;
        this.emit({
          type: "error",
          projectId,
          message: existing.lastError,
          agent: this.summarizeAgent(projectId, config),
        });
        throw error;
      }
    }
    if (existing && existing.status === "error") {
      existing.disposeUpdateSubscription?.();
      await existing.client.close();
      this.runtimes.delete(key);
    }

    const runtime = this.createRuntime(projectId, config);
    this.runtimes.set(key, runtime);

    try {
      await this.establishRuntimeSession(projectId, runtime);
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

  private collectSessions(projectId: string, sessionIds?: string[]): Session[] {
    if (sessionIds && sessionIds.length > 0) {
      return [...new Set(sessionIds)]
        .map((sessionId) => getSession(sessionId))
        .filter((session): session is Session => Boolean(session && isDispatchableSession(session)))
    }

    return filterSessionsByProject(listSessions(), projectId).filter(isDispatchableSession)
  }

  private collectPendingAnnotations(projectId: string, sessionIds?: string[]): AnnotationV2[] {
    if (sessionIds && sessionIds.length > 0) {
      return [...new Set(sessionIds)].flatMap((sessionId) => {
        const session = getSession(sessionId)
        return session && isDispatchableSession(session)
          ? getPendingAnnotationsV2(sessionId)
          : []
      })
    }

    const sessions = filterSessionsByProject(listSessions(), projectId).filter(isDispatchableSession)
    return sessions.flatMap((session) => getPendingAnnotationsV2(session.id))
  }

  async dispatch(params: {
    projectId: string;
    mode: "auto" | "manual";
    trigger: "annotation.upsert" | "manual.send";
    sessionId?: string;
  }): Promise<AgentDispatchState> {
    const agentId = this.getEffectiveAgentId(params.projectId)
    if (!agentId) {
      throw new Error("No active agent configured for this project")
    }

    requeueExpiredProcessingAnnotationsV2()
    const pendingAnnotations = this.collectPendingAnnotations(params.projectId, normalizeSessionIds(params.sessionId))
    if (pendingAnnotations.length === 0) {
      return this.updateDispatchState(params.projectId, {
        agentId,
        mode: params.mode,
        trigger: params.trigger,
        state: "skipped",
        message: "No pending annotations to send",
      }, "dispatch.skipped")
    }

    const queued = this.queueDispatch({
      runId: randomUUID(),
      projectId: params.projectId,
      agentId,
      mode: params.mode,
      trigger: params.trigger,
      sessionIds: normalizeSessionIds(params.sessionId),
      queuedAt: nowIso(),
    })

    const state = this.emitQueuedDispatchState(queued.run, queued.queuePosition, queued.merged)
    this.scheduleDispatchDrain(params.projectId)
    return state
  }

  private async drainDispatchQueue(projectId: string): Promise<void> {
    if (this.drainingProjects.has(projectId)) {
      return
    }

    this.drainingProjects.add(projectId)
    try {
      while (!this.activeDispatchRunByProject.has(projectId)) {
        const next = this.dequeueDispatch(projectId)
        if (!next) break
        await this.executeDispatch(next)
      }
    } finally {
      this.drainingProjects.delete(projectId)
      if (!this.activeDispatchRunByProject.has(projectId) && this.getDispatchQueue(projectId).length > 0) {
        this.scheduleDispatchDrain(projectId)
      }
    }
  }

  private async executeDispatch(run: QueuedDispatchRun): Promise<AgentDispatchState> {
    const pendingAnnotations = this.collectPendingAnnotations(run.projectId, run.sessionIds)
    if (pendingAnnotations.length === 0) {
      return this.updateDispatchState(run.projectId, {
        agentId: run.agentId,
        runId: run.runId,
        mode: run.mode,
        trigger: run.trigger,
        state: "skipped",
        message: "No pending annotations to send",
      }, "dispatch.skipped")
    }

    const sessions = this.collectSessions(run.projectId, run.sessionIds)
    let runtime: AgentRuntime | undefined
    let annotations: AnnotationV2[] = []
    let activeRun: PendingDispatchRun | undefined
    let unsubscribeRunUpdates = () => {}

    try {
      runtime = await this.ensureRuntime(run.projectId, run.agentId)
      if (!runtime.sessionId) {
        throw new Error("Agent session was not established")
      }

      annotations = this.claimPendingAnnotations(run.projectId, run.agentId, run.runId, run.sessionIds)
      if (annotations.length === 0) {
        return this.updateDispatchState(run.projectId, {
          agentId: run.agentId,
          runId: run.runId,
          mode: run.mode,
          trigger: run.trigger,
          state: "skipped",
          claimedCount: 0,
          completedCount: 0,
          message: "All pending annotations are already processing",
        }, "dispatch.skipped")
      }

      runtime.status = "busy"
      runtime.lastAgentText = ""
      runtime.lastError = undefined
      runtime.lastProgressMessage = undefined

      activeRun = {
        ...run,
        annotationIds: annotations.map((annotation) => annotation.id),
        completedAnnotationIds: new Set<string>(),
        cancelRequested: false,
        currentAnnotationId: annotations[0]?.id,
      }
      this.activeDispatchRunByProject.set(run.projectId, activeRun)

      unsubscribeRunUpdates = this.subscribeToRunAnnotationUpdates(activeRun)
      this.emit({
        type: "status",
        projectId: run.projectId,
        agent: this.summarizeAgent(run.projectId, runtime.config),
      })

      this.updateDispatchState(run.projectId, {
        agentId: run.agentId,
        runId: run.runId,
        mode: run.mode,
        trigger: run.trigger,
        state: "sending",
        claimedCount: annotations.length,
        completedCount: 0,
        currentAnnotationId: activeRun.currentAnnotationId,
        message: `Dispatching ${annotations.length} claimed annotation${annotations.length === 1 ? "" : "s"} to agent`,
      }, "dispatch.started")

      const prompt = buildPrompt({
        projectId: run.projectId,
        agentId: run.agentId,
        runId: run.runId,
        mode: run.mode,
        trigger: run.trigger,
        annotations,
        sessions,
      })
      const result = await runtime.client.prompt(runtime.sessionId, prompt)
      runtime.status = "ready"

      const currentActiveRun = this.activeDispatchRunByProject.get(run.projectId)
      if (!currentActiveRun || currentActiveRun.runId !== run.runId || currentActiveRun.cancelRequested) {
        return this.getDispatchState(run.projectId) ?? {
          projectId: run.projectId,
          agentId: run.agentId,
          runId: run.runId,
          mode: run.mode,
          trigger: run.trigger,
          state: "cancelled",
          claimedCount: annotations.length,
          completedCount: currentActiveRun?.completedAnnotationIds.size ?? 0,
          message: "Cancelled current agent turn",
          updatedAt: nowIso(),
        }
      }

      const unresolvedIds = currentActiveRun.annotationIds.filter(
        (annotationId) => !currentActiveRun.completedAnnotationIds.has(annotationId),
      )
      if (unresolvedIds.length > 0) {
        this.releaseClaimedAnnotations(unresolvedIds, {
          agentId: run.agentId,
          runId: run.runId,
        })
      }

      this.recordSuccessfulDispatchSessions(runtime.config, annotations, run.runId)
      return this.updateDispatchState(run.projectId, {
        agentId: run.agentId,
        runId: run.runId,
        mode: run.mode,
        trigger: run.trigger,
        state: "succeeded",
        claimedCount: annotations.length,
        completedCount: currentActiveRun.completedAnnotationIds.size,
        message: this.buildCompletionMessage(currentActiveRun, runtime.lastAgentText, result.stopReason),
      }, "dispatch.completed")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!activeRun) {
        if (runtime) {
          runtime.status = "error"
          runtime.lastError = message
        }

        if (annotations.length > 0) {
          this.releaseClaimedAnnotations(annotations.map((annotation) => annotation.id), {
            agentId: run.agentId,
            runId: run.runId,
          })
        }

        return this.updateDispatchState(run.projectId, {
          agentId: run.agentId,
          runId: run.runId,
          mode: run.mode,
          trigger: run.trigger,
          state: "failed",
          claimedCount: annotations.length,
          completedCount: 0,
          message,
        }, "dispatch.failed")
      }

      const currentActiveRun = this.activeDispatchRunByProject.get(run.projectId)
      if (!currentActiveRun || currentActiveRun.runId !== run.runId || currentActiveRun.cancelRequested) {
        runtime.status = "ready"
        return this.getDispatchState(run.projectId) ?? {
          projectId: run.projectId,
          agentId: run.agentId,
          runId: run.runId,
          mode: run.mode,
          trigger: run.trigger,
          state: "cancelled",
          claimedCount: annotations.length,
          completedCount: currentActiveRun?.completedAnnotationIds.size ?? 0,
          message: "Cancelled current agent turn",
          updatedAt: nowIso(),
        }
      }

      runtime.status = "error"
      runtime.lastError = message
      this.releaseClaimedAnnotations(annotations.map((annotation) => annotation.id), {
        agentId: run.agentId,
        runId: run.runId,
      })
      return this.updateDispatchState(run.projectId, {
        agentId: run.agentId,
        runId: run.runId,
        mode: run.mode,
        trigger: run.trigger,
        state: "failed",
        claimedCount: annotations.length,
        completedCount: currentActiveRun.completedAnnotationIds.size,
        message,
      }, "dispatch.failed")
    } finally {
      unsubscribeRunUpdates()
      const currentActiveRun = this.activeDispatchRunByProject.get(run.projectId)
      if (currentActiveRun?.runId === run.runId) {
        this.activeDispatchRunByProject.delete(run.projectId)
      }
      if (runtime) {
        this.emit({
          type: "status",
          projectId: run.projectId,
          agent: this.summarizeAgent(run.projectId, runtime.config),
        })
      }

      const nextRun = this.getNextQueuedDispatch(run.projectId)
      if (nextRun) {
        this.emitQueuedDispatchState(nextRun, 1, false)
      }
    }
  }

  async cancelDispatch(projectId: string): Promise<AgentDispatchState | undefined> {
    const activeRun = this.activeDispatchRunByProject.get(projectId)
    if (activeRun) {
      const runtime = this.runtimes.get(this.runtimeKey(projectId, activeRun.agentId))
      activeRun.cancelRequested = true
      if (runtime?.sessionId) {
        await runtime.client.cancel(runtime.sessionId)
        runtime.status = "ready"
      }

      this.releaseClaimedAnnotations(activeRun.annotationIds, {
        agentId: activeRun.agentId,
        runId: activeRun.runId,
      })
      this.activeDispatchRunByProject.delete(projectId)

      this.emit({
        type: "status",
        projectId,
        agent: this.summarizeAgent(projectId, runtime?.config ?? this.resolveAgentConfig(activeRun.agentId)),
      })

      const cancelled = this.updateDispatchState(projectId, {
        agentId: activeRun.agentId,
        runId: activeRun.runId,
        mode: activeRun.mode,
        trigger: activeRun.trigger,
        state: "cancelled",
        claimedCount: activeRun.annotationIds.length,
        completedCount: activeRun.completedAnnotationIds.size,
        message: "Cancelled current agent turn",
      }, "dispatch.cancelled")

      const nextRun = this.getNextQueuedDispatch(projectId)
      if (nextRun) {
        this.emitQueuedDispatchState(nextRun, 1, false)
        this.scheduleDispatchDrain(projectId)
      }

      return cancelled
    }

    const nextRun = this.dequeueDispatch(projectId)
    if (!nextRun) {
      const agentId = this.getEffectiveAgentId(projectId)
      if (!agentId) return undefined

      return this.updateDispatchState(projectId, {
        agentId,
        mode: "manual",
        trigger: "manual.send",
        state: "cancelled",
        message: "Cancelled current agent turn",
      }, "dispatch.cancelled")
    }

    const cancelled = this.updateDispatchState(projectId, {
      agentId: nextRun.agentId,
      runId: nextRun.runId,
      mode: nextRun.mode,
      trigger: nextRun.trigger,
      state: "cancelled",
      queuePosition: 1,
      message: "Cancelled queued agent run",
    }, "dispatch.cancelled")

    const followingRun = this.getNextQueuedDispatch(projectId)
    if (followingRun) {
      this.emitQueuedDispatchState(followingRun, 1, false)
      this.scheduleDispatchDrain(projectId)
    }

    return cancelled
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
