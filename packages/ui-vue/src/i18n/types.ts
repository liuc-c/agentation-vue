import type { ExportExcludeField, OutputDetailLevel } from "@liuovo/agentation-vue-core"

// ---------------------------------------------------------------------------
// i18n type definitions
// ---------------------------------------------------------------------------

/** Supported UI locales. */
export type Locale = "en" | "zh-CN"

/**
 * Typed message catalog.
 * English catalog is the canonical schema; other locales must satisfy the same shape.
 * Static strings are plain `string`, dynamic strings are functions.
 */
export interface Messages {
  toolbar: {
    pause: string
    resume: string
    pauseAria: string
    resumeAria: string
    hideMarkers: string
    showMarkers: string
    hideMarkersAria: string
    showMarkersAria: string
    copyMarkdown: string
    copyMarkdownAria: string
    copyJson: string
    copyJsonAria: string
    sendToAgent: string
    sendToAgentAria: string
    clearAll: string
    clearAllAria: string
    agentWorkspace: string
    openAgentWorkspaceAria: string
    settings: string
    toggleSettingsAria: string
    closeToolbar: string
    closeToolbarAria: string
  }
  popover: {
    editPlaceholder: string
    createPlaceholder: string
    deleteAnnotation: string
    cancel: string
    save: string
    update: string
  }
  marker: {
    annotationAria: (n: number) => string
    clickToEdit: string
  }
  workflow: {
    statusPending: string
    statusAcknowledged: string
    statusProcessing: string
    statusResolved: string
    statusDismissed: string
    roleAgent: string
    roleHuman: string
    thread: string
    replyCount: (count: number) => string
  }
  settings: {
    lightMode: string
    darkMode: string
    switchToLightAria: string
    switchToDarkAria: string
    language: string
    outputDetail: string
    exportFormat: string
    exportFormatMarkdownAria: string
    exportFormatJsonAria: string
    copySettings: string
    copySettingsDescription: string
    copyPrefix: string
    copyPrefixDescription: string
    copyPrefixPlaceholder: string
    copyExclusions: string
    copyExclusionsDescription: string
    copyFieldLabels: Record<ExportExcludeField, string>
    markerColour: string
    clearOnCopy: string
    blockPageInteractions: string
    componentSource: string
    manageAgents: string
    manageCompanion: string
    agentWorkspaceDescription: string
    companionWorkspaceDescription: string
    companionStatus: string
    companionEndpointLabel: string
    mcpEndpointLabel: string
    noAgentSelected: string
    selectAgentToStart: string
    connectAgentToStart: string
    sendPendingToStart: string
    installAgentHint: string
    installAgent: string
    openHomepage: string
    currentAgent: string
    primaryAction: string
    availableOnMachine: string
    installableOnMachine: string
    notInstalledOnMachine: string
    getStarted: string
    mcpConnection: string
    mcpLearnMore: string
    mcpStatusConnected: string
    mcpStatusDisconnected: string
    agentsConnection: string
    agentSelection: string
    availableAgents: string
    autoSendToAgent: string
    autoSendDescription: string
    noPendingAnnotations: string
    manualSend: string
    cancelSend: string
    connectAgent: string
    disconnectAgent: string
    agentInstallPrerequisite: string
    activeAgent: string
    useAgent: string
    useAgentAria: (label: string) => string
    selectedAgentAria: (label: string) => string
    noAgentsAvailable: string
    agentStatusReady: string
    agentStatusAvailable: string
    agentStatusInstallable: string
    agentStatusMissing: string
    agentStatusConnecting: string
    agentStatusBusy: string
    agentStatusError: string
    agentLastActivity: string
    agentSessions: string
    agentSessionsDescription: string
    agentSessionsCount: (active: number, total: number) => string
    refreshSessions: string
    noAgentSessions: string
    viewSession: string
    hideSession: string
    closeSession: string
    sessionIdLabel: string
    sessionUrlLabel: string
    sessionCreatedLabel: string
    sessionUpdatedLabel: string
    sessionAgentLabel: string
    sessionAnnotationsLabel: string
    sessionAnnotationCount: (count: number) => string
    sessionHandledCount: (count: number) => string
    sessionStatusActive: string
    sessionStatusApproved: string
    sessionStatusClosed: string
    sessionDetailLoading: string
    sessionDetailError: (message: string) => string
    sessionNoAnnotations: string
    outputDetailHelp: string
    componentSourceHelp: string
    blockInteractionsHelp: string
    getStartedDescription: string
    sharedServerTitle: string
    sharedServerDescription: string
    isolationTitle: string
    isolationDescription: string
    projectScopeLabel: string
    mcpHttpEndpointLabel: string
    mcpSseEndpointLabel: string
    copyValueAria: (label: string) => string
  }
  colors: {
    purple: string
    blue: string
    cyan: string
    green: string
    yellow: string
    orange: string
    red: string
  }
  outputDetail: Record<OutputDetailLevel, string>
  selection: {
    areaLabel: (count: number, names: string, remaining: number) => string
  }
  notifications: {
    sourceUnavailableElement: string
    sourceUnavailableArea: string
    remoteSyncUpdated: (count: number) => string
    syncFailed: (message: string) => string
    agentBridgeFailed: (message: string) => string
    agentDispatchFailed: (message: string) => string
    agentDispatchSucceeded: (message: string) => string
  }
}

/** Color key matching entries in `Messages["colors"]`. */
export type ColorKey = keyof Messages["colors"]
