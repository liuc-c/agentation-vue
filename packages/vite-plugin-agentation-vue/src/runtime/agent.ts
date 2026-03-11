import type {
  AgentSessionDetail,
  AgentSessionSummary,
  RuntimeAgentBridge,
  RuntimeAgentEvent,
  RuntimeAgentSessionsState,
  RuntimeAgentState,
} from "@liuovo/agentation-vue-ui"

interface AgentResponse extends RuntimeAgentState {
  projectId?: string
}

interface AgentSessionsResponse extends RuntimeAgentSessionsState {
  projectId?: string
}

function isVisibleSession(session: AgentSessionSummary): boolean {
  return session.status !== "closed" || session.annotationCount > 0
}

function normalizeSessionsResponse(
  state: AgentSessionsResponse | AgentSessionSummary[],
  projectId?: string,
): RuntimeAgentSessionsState {
  const sessions = Array.isArray(state)
    ? state
    : state.sessions ?? []

  if (Array.isArray(state)) {
    return {
      projectId,
      sessions: sessions.filter(isVisibleSession),
    }
  }

  return {
    projectId: state.projectId ?? projectId,
    sessions: sessions.filter(isVisibleSession),
  }
}

const PROJECT_AGENT_STORAGE_KEY = "agentation-vue-agent-selection-by-project"

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed: ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) {
        message = body.error
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function loadStoredAgentId(projectId?: string): string | undefined {
  if (!projectId || typeof window === "undefined") return undefined

  try {
    const raw = window.localStorage.getItem(PROJECT_AGENT_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed[projectId]
    return typeof value === "string" && value.trim()
      ? value.trim()
      : undefined
  } catch {
    return undefined
  }
}

function saveStoredAgentId(projectId: string | undefined, agentId: string): void {
  if (!projectId || typeof window === "undefined") return

  try {
    const raw = window.localStorage.getItem(PROJECT_AGENT_STORAGE_KEY)
    const current = raw ? JSON.parse(raw) as Record<string, unknown> : {}
    current[projectId] = agentId
    window.localStorage.setItem(PROJECT_AGENT_STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Ignore storage failures.
  }
}

function clearStoredAgentId(projectId?: string): void {
  if (!projectId || typeof window === "undefined") return

  try {
    const raw = window.localStorage.getItem(PROJECT_AGENT_STORAGE_KEY)
    if (!raw) return
    const current = JSON.parse(raw) as Record<string, unknown>
    delete current[projectId]
    window.localStorage.setItem(PROJECT_AGENT_STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Ignore storage failures.
  }
}

export function createRuntimeAgentBridge(input: {
  endpoint: string
  projectId?: string
}): RuntimeAgentBridge {
  const endpoint = trimTrailingSlash(input.endpoint)
  const projectId = input.projectId?.trim() || undefined
  const listeners = new Set<(event: RuntimeAgentEvent) => void>()
  const eventUrl = projectId
    ? `${endpoint}/v2/agents/events?projectId=${encodeURIComponent(projectId)}`
    : null

  let eventSource: EventSource | null = null
  let autoMode = false
  let autoDispatchTimer: ReturnType<typeof setTimeout> | undefined

  function emit(event: RuntimeAgentEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function clearAutoDispatchTimer(): void {
    if (autoDispatchTimer != null) {
      clearTimeout(autoDispatchTimer)
      autoDispatchTimer = undefined
    }
  }

  async function refresh(): Promise<RuntimeAgentState> {
    if (!projectId) {
      return {
        projectId,
        agents: [],
      }
    }

    const response = await fetch(`${endpoint}/v2/agents?projectId=${encodeURIComponent(projectId)}`)
    const state = await parseJson<AgentResponse>(response)
    emit({
      type: "list",
      projectId,
      agents: state.agents,
      dispatch: state.dispatch,
      timestamp: new Date().toISOString(),
    })
    return state
  }

  async function refreshSessions(): Promise<RuntimeAgentSessionsState> {
    if (!projectId) {
      return {
        projectId,
        sessions: [],
      }
    }

    const response = await fetch(`${endpoint}/v2/sessions?projectFilter=${encodeURIComponent(projectId)}`)
    const state = await parseJson<AgentSessionsResponse | AgentSessionSummary[]>(response)
    return normalizeSessionsResponse(state, projectId)
  }

  async function post<T>(pathname: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${endpoint}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    return parseJson<T>(response)
  }

  function ensureEventSource(): void {
    if (!eventUrl || eventSource) return

    const source = new EventSource(eventUrl)
    const onEvent = (event: MessageEvent<string>) => {
      try {
        emit(JSON.parse(event.data) as RuntimeAgentEvent)
      } catch (error) {
        emit({
          type: "error",
          projectId,
          message: error instanceof Error ? error.message : "Invalid agent event payload",
          timestamp: new Date().toISOString(),
        })
      }
    }
    for (const eventName of [
      "list",
      "status",
      "dispatch",
      "dispatch.queued",
      "dispatch.started",
      "dispatch.progress",
      "dispatch.annotation.completed",
      "dispatch.completed",
      "dispatch.failed",
      "dispatch.cancelled",
      "dispatch.skipped",
      "agent-error",
    ]) {
      source.addEventListener(eventName, onEvent as EventListener)
    }
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED && eventSource === source) {
        eventSource = null
      }
    }

    eventSource = source
  }

  return {
    projectId,

    async init(selectedAgentId, initialAutoMode) {
      autoMode = Boolean(initialAutoMode)
      ensureEventSource()

      const storedAgentId = loadStoredAgentId(projectId)
      const initialState = await refresh()
      const selectableAgentIds = new Set(
        initialState.agents
          .filter((agent) => agent.available)
          .map((agent) => agent.id),
      )
      const activeAgentId = initialState.agents.find((agent) => agent.isActive && agent.available)?.id
      if (activeAgentId) {
        saveStoredAgentId(projectId, activeAgentId)
      }
      const candidateAgentIds = [...new Set([
        selectedAgentId,
        storedAgentId,
      ].filter((value): value is string => Boolean(value?.trim())))]

      for (const agentId of candidateAgentIds) {
        if (!selectableAgentIds.has(agentId)) {
          if (agentId === storedAgentId) {
            clearStoredAgentId(projectId)
          }
          continue
        }

        if (agentId === activeAgentId) {
          return
        }

        await this.selectAgent(agentId)
        return
      }
    },

    setAutoMode(enabled) {
      autoMode = enabled
      if (!enabled) {
        clearAutoDispatchTimer()
      }
    },

    listAgents() {
      return refresh()
    },

    listSessions() {
      return refreshSessions()
    },

    async getSessionDetail(sessionId) {
      const response = await fetch(`${endpoint}/v2/sessions/${encodeURIComponent(sessionId)}`)
      return parseJson<AgentSessionDetail>(response)
    },

    async selectAgent(agentId) {
      if (!projectId) return { projectId, agents: [] }
      const state = await post<AgentResponse>("/v2/agents/select", {
        projectId,
        agentId,
      })
      saveStoredAgentId(projectId, agentId)
      emit({
        type: "list",
        projectId,
        agents: state.agents,
        dispatch: state.dispatch,
        timestamp: new Date().toISOString(),
      })
      return state
    },

    async connect(agentId) {
      if (!projectId) return { projectId, agents: [] }
      const state = await post<AgentResponse>("/v2/agents/connect", {
        projectId,
        ...(agentId ? { agentId } : {}),
      })
      emit({
        type: "list",
        projectId,
        agents: state.agents,
        dispatch: state.dispatch,
        timestamp: new Date().toISOString(),
      })
      return state
    },

    async disconnect(agentId) {
      if (!projectId) return { projectId, agents: [] }
      const state = await post<AgentResponse>("/v2/agents/disconnect", {
        projectId,
        ...(agentId ? { agentId } : {}),
      })
      emit({
        type: "list",
        projectId,
        agents: state.agents,
        dispatch: state.dispatch,
        timestamp: new Date().toISOString(),
      })
      return state
    },

    async dispatch(mode, trigger, sessionId) {
      if (!projectId) return { projectId, agents: [] }
      const state = await post<AgentResponse>("/v2/dispatch", {
        projectId,
        mode,
        trigger,
        ...(sessionId ? { sessionId } : {}),
      })
      emit({
        type: "dispatch",
        projectId,
        agents: state.agents,
        dispatch: state.dispatch,
        timestamp: new Date().toISOString(),
      })
      return state
    },

    async closeSession(sessionId) {
      if (!projectId) return { projectId, sessions: [] }
      const response = await fetch(`${endpoint}/v2/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      })
      await parseJson<Record<string, unknown>>(response)

      return refreshSessions()
    },

    enqueueAutoDispatch(trigger, sessionId) {
      if (!autoMode || !projectId) return

      clearAutoDispatchTimer()
      autoDispatchTimer = setTimeout(() => {
        autoDispatchTimer = undefined
        void this.dispatch("auto", trigger, sessionId).catch((error) => {
          emit({
            type: "error",
            projectId,
            message: error instanceof Error ? error.message : "Auto dispatch failed",
            timestamp: new Date().toISOString(),
          })
        })
      }, 450)
    },

    async cancelDispatch() {
      if (!projectId) return { projectId, agents: [] }
      const state = await post<AgentResponse>("/v2/dispatch/cancel", {
        projectId,
      })
      emit({
        type: "dispatch",
        projectId,
        agents: state.agents,
        dispatch: state.dispatch,
        timestamp: new Date().toISOString(),
      })
      return state
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      clearAutoDispatchTimer()
      eventSource?.close()
      eventSource = null
      listeners.clear()
    },
  }
}
