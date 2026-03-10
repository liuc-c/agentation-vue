import type {
  RuntimeAgentBridge,
  RuntimeAgentEvent,
  RuntimeAgentState,
} from "@liuovo/agentation-vue-ui"

interface AgentResponse extends RuntimeAgentState {
  projectId?: string
}

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
    source.addEventListener("list", onEvent as EventListener)
    source.addEventListener("status", onEvent as EventListener)
    source.addEventListener("dispatch", onEvent as EventListener)
    source.addEventListener("agent-error", onEvent as EventListener)
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

      if (selectedAgentId && projectId) {
        try {
          await this.selectAgent(selectedAgentId)
        } catch {
          // ignore persisted stale values
        }
      }

      await refresh()
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

    async selectAgent(agentId) {
      if (!projectId) return { projectId, agents: [] }
      const state = await post<AgentResponse>("/v2/agents/select", {
        projectId,
        agentId,
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
