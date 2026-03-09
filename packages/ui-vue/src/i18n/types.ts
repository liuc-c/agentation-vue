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
    clearAll: string
    clearAllAria: string
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
    manageMcpWebhooks: string
    getStarted: string
    mcpConnection: string
    mcpDescription: string
    mcpLearnMore: string
    mcpStatusConnected: string
    mcpStatusDisconnected: string
    webhooks: string
    webhooksDescription: string
    webhooksAutoSend: string
    webhooksUrlPlaceholder: string
    outputDetailHelp: string
    componentSourceHelp: string
    blockInteractionsHelp: string
    getStartedDescription: string
    sharedServerTitle: string
    sharedServerDescription: string
    isolationTitle: string
    isolationDescription: string
    projectScopeLabel: string
    apiEndpointLabel: string
    mcpHttpEndpointLabel: string
    mcpSseEndpointLabel: string
    cliCommandLabel: string
    claudeCommandLabel: string
    cursorEndpointLabel: string
    codexEndpointLabel: string
    webhookEnvLabel: string
    webhookDescriptionLong: string
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
  }
}

/** Color key matching entries in `Messages["colors"]`. */
export type ColorKey = keyof Messages["colors"]
