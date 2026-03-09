import type { Session } from "../types.js"

export interface ProjectGroup {
  projectKey: string
  projectId?: string
  origin?: string
  pathPrefix?: string
  sessionCount: number
  activeSessionCount: number
  urls: string[]
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function getPathPrefix(url: URL): string {
  const [firstSegment] = url.pathname.split("/").filter(Boolean)
  return firstSegment ? `/${firstSegment}` : "/"
}

export function inferProjectKey(session: Pick<Session, "projectId" | "url">): string {
  const projectId = session.projectId?.trim()
  if (projectId) {
    return projectId
  }

  const url = parseUrl(session.url)
  if (!url) {
    return session.url
  }

  const prefix = getPathPrefix(url)
  return `${url.origin}${prefix === "/" ? "" : prefix}`
}

export function getProjectScopeTags(
  session: Pick<Session, "projectId" | "url">,
): string[] {
  const url = parseUrl(session.url)
  const key = inferProjectKey(session)
  const tags = new Set<string>([
    key,
    session.projectId ?? "",
    session.url,
  ])

  if (url) {
    tags.add(url.origin)
    tags.add(url.host)
    tags.add(url.hostname)
    tags.add(url.pathname)
    tags.add(`${url.origin}${getPathPrefix(url)}`)
  }

  return [...tags].filter(Boolean)
}

export function matchesProjectFilter(
  session: Pick<Session, "projectId" | "url">,
  projectFilter: string | undefined,
): boolean {
  const filter = normalize(projectFilter)
  if (!filter) return true

  return getProjectScopeTags(session).some((tag) => normalize(tag).includes(filter))
}

export function filterSessionsByProject(
  sessions: readonly Session[],
  projectFilter: string | undefined,
): Session[] {
  if (!projectFilter?.trim()) {
    return [...sessions]
  }

  return sessions.filter((session) => matchesProjectFilter(session, projectFilter))
}

export function groupSessionsByProject(
  sessions: readonly Session[],
): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>()

  for (const session of sessions) {
    const key = inferProjectKey(session)
    const parsedUrl = parseUrl(session.url)
    const group = groups.get(key) ?? {
      projectKey: key,
      projectId: session.projectId,
      origin: parsedUrl?.origin,
      pathPrefix: parsedUrl ? getPathPrefix(parsedUrl) : undefined,
      sessionCount: 0,
      activeSessionCount: 0,
      urls: [],
    }

    group.sessionCount += 1
    if (session.status === "active") {
      group.activeSessionCount += 1
    }
    if (!group.urls.includes(session.url)) {
      group.urls.push(session.url)
    }

    groups.set(key, group)
  }

  return [...groups.values()].sort((left, right) =>
    left.projectKey.localeCompare(right.projectKey),
  )
}
