import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type JsonRpcId = number;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export interface AcpInitializeResult {
  protocolVersion: number;
  agentCapabilities?: {
    loadSession?: boolean;
    mcp?: {
      http?: boolean;
      sse?: boolean;
    };
    mcpCapabilities?: {
      http?: boolean;
      sse?: boolean;
    };
  };
  agentInfo?: {
    name?: string;
    title?: string;
    version?: string;
  };
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export interface SessionUpdateNotification {
  sessionId?: string;
  update?: Record<string, unknown>;
}

export interface AcpClientOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd: string;
  spawnImpl?: typeof spawn;
}

export interface AcpPromptResult {
  stopReason?: string;
}

export class AcpClient {
  private readonly command: string;
  private readonly args: string[];
  private readonly env: Record<string, string>;
  private readonly cwd: string;
  private readonly spawnImpl: typeof spawn;
  private readonly listeners = new Set<(notification: SessionUpdateNotification) => void>();
  private readonly pending = new Map<JsonRpcId, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 0;
  private buffer = "";
  private exited = false;

  constructor(options: AcpClientOptions) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.env = options.env ?? {};
    this.cwd = options.cwd;
    this.spawnImpl = options.spawnImpl ?? spawn;
  }

  async start(): Promise<void> {
    if (this.child) return;

    const child = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.env,
      },
      stdio: "pipe",
    });

    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", () => {
      // stderr is reserved for logs
    });
    child.on("error", (error) => this.failPending(error instanceof Error ? error : new Error(String(error))));
    child.on("exit", (code, signal) => {
      this.exited = true;
      this.failPending(new Error(`ACP agent exited (${signal ?? code ?? "unknown"})`));
      this.child = null;
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;

    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line) as JsonRpcRequest | JsonRpcResponse;
        this.onMessage(message);
      } catch (error) {
        this.failPending(new Error(`Invalid ACP JSON: ${(error as Error).message}`));
      }
    }
  }

  private onMessage(message: JsonRpcRequest | JsonRpcResponse): void {
    if ("id" in message && typeof message.id === "number" && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if ("method" in message) {
      if (message.method === "session/update") {
        const params = message.params as SessionUpdateNotification | undefined;
        for (const listener of this.listeners) {
          listener(params ?? {});
        }
        return;
      }

      if (typeof message.id === "number") {
        void this.send({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unsupported client method: ${message.method}`,
          },
        });
      }
    }
  }

  private async send(message: Record<string, unknown>): Promise<void> {
    if (!this.child || this.exited) {
      throw new Error("ACP agent process is not running");
    }

    const serialized = `${JSON.stringify(message)}\n`;
    await new Promise<void>((resolve, reject) => {
      this.child!.stdin.write(serialized, "utf8", (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async request<T>(method: string, params?: unknown): Promise<T> {
    const id = ++this.nextId;
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });

    await this.send({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    });

    return result;
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  subscribe(listener: (notification: SessionUpdateNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<AcpInitializeResult> {
    return this.request<AcpInitializeResult>("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: {
        name: "agentation-vue",
        title: "Agentation Vue",
        version: "0.0.11",
      },
    });
  }

  async createSession(cwd: string, mcpServers: McpServerConfig[]): Promise<{ sessionId: string }> {
    return this.request<{ sessionId: string }>("session/new", {
      cwd,
      mcpServers,
    });
  }

  async loadSession(sessionId: string, cwd: string, mcpServers: McpServerConfig[]): Promise<void> {
    await this.request("session/load", {
      sessionId,
      cwd,
      mcpServers,
    });
  }

  async prompt(sessionId: string, promptText: string): Promise<AcpPromptResult> {
    return this.request<AcpPromptResult>("session/prompt", {
      sessionId,
      prompt: [
        {
          type: "text",
          text: promptText,
        },
      ],
    });
  }

  async cancel(sessionId: string): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId },
    });
  }

  async close(): Promise<void> {
    this.failPending(new Error("ACP client closed"));

    if (!this.child) return;
    const child = this.child;
    this.child = null;

    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 500);
    });
  }
}
