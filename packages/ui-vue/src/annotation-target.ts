import type { AnnotationV2 } from "@liuovo/agentation-vue-core"
import type { BoundingBox } from "./types.js"

export interface ElementLocator {
  selector?: string
  tag?: string
  text?: string
  classes?: string[]
  position?: BoundingBox
}

export function buildElementLocator(element: HTMLElement): ElementLocator {
  const rect = element.getBoundingClientRect()
  const classes = Array.from(element.classList)
    .filter(isStableClass)
    .slice(0, 4)
  const text = normalizeText(element.textContent).slice(0, 100)

  return {
    selector: generateSelector(element) ?? undefined,
    tag: element.tagName.toLowerCase(),
    text: text || undefined,
    classes: classes.length > 0 ? classes : undefined,
    position: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  }
}

export function findAnnotationTarget(annotation: AnnotationV2): HTMLElement | null {
  const metadata = annotation.metadata as {
    isMultiSelect?: boolean
  } | undefined

  if (metadata?.isMultiSelect) return null

  const locator = getElementLocator(annotation)
  if (!locator) return null

  if (locator.selector) {
    const exact = querySelectorDeep(locator.selector)
    if (exact) return exact
  }

  const tag = locator.tag
  if (!tag) return null

  const candidates = querySelectorAllDeep(tag)
  if (candidates.length === 0) return null

  const exactTextMatches = locator.text
    ? candidates.filter((candidate) => normalizeText(candidate.textContent) === locator.text)
    : []

  if (exactTextMatches.length === 1) {
    return exactTextMatches[0]
  }

  const pool = exactTextMatches.length > 0 ? exactTextMatches : candidates
  const ranked = pool
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, locator),
    }))
    .sort((a, b) => b.score - a.score)

  if (ranked.length === 0 || ranked[0].score <= 0) {
    return null
  }

  return ranked[0].candidate
}

function getElementLocator(annotation: AnnotationV2): ElementLocator | null {
  const metadata = annotation.metadata as {
    elementLocator?: unknown
  } | undefined

  return parseElementLocator(metadata?.elementLocator)
}

function parseElementLocator(value: unknown): ElementLocator | null {
  if (!value || typeof value !== "object") return null

  const locator = value as Partial<ElementLocator>
  const parsed: ElementLocator = {}

  if (typeof locator.selector === "string" && locator.selector.trim()) {
    parsed.selector = locator.selector
  }
  if (typeof locator.tag === "string" && locator.tag.trim()) {
    parsed.tag = locator.tag.toLowerCase()
  }
  if (typeof locator.text === "string" && locator.text.trim()) {
    parsed.text = normalizeText(locator.text).slice(0, 100)
  }
  if (Array.isArray(locator.classes)) {
    const classes = locator.classes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    if (classes.length > 0) {
      parsed.classes = classes
    }
  }
  if (isBoundingBox(locator.position)) {
    parsed.position = locator.position
  }

  return Object.keys(parsed).length > 0 ? parsed : null
}

function generateSelector(element: HTMLElement): string | null {
  if (element.id) {
    return `#${CSS.escape(element.id)}`
  }

  for (const attr of ["data-testid", "data-test", "aria-label", "title", "name", "role"]) {
    const value = element.getAttribute(attr)
    if (!value) continue
    const selector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`
    if (isUniqueSelector(selector)) return selector
  }

  const stableClasses = Array.from(element.classList)
    .filter(isStableClass)
    .slice(0, 4)

  if (stableClasses.length > 0) {
    const selector = `${element.tagName.toLowerCase()}.${stableClasses.map((item) => CSS.escape(item)).join(".")}`
    if (isUniqueSelector(selector)) return selector
  }

  return buildPathSelector(element)
}

function buildPathSelector(element: HTMLElement): string | null {
  const segments: string[] = []
  let current: HTMLElement | null = element
  let depth = 0

  while (current && current.tagName.toLowerCase() !== "body" && depth < 5) {
    const tag = current.tagName.toLowerCase()
    let segment = tag

    if (current.id) {
      segment = `${tag}#${CSS.escape(current.id)}`
      segments.unshift(segment)
      const selector = segments.join(" > ")
      return isUniqueSelector(selector) ? selector : null
    }

    const stableClasses = Array.from(current.classList)
      .filter(isStableClass)
      .slice(0, 2)

    if (stableClasses.length > 0) {
      segment = `${tag}.${stableClasses.map((item) => CSS.escape(item)).join(".")}`
    } else if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children)
        .filter((child) => child.tagName.toLowerCase() === tag)
      if (siblings.length > 1) {
        segment = `${tag}:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }

    segments.unshift(segment)
    const selector = segments.join(" > ")
    if (isUniqueSelector(selector)) return selector

    current = current.parentElement
    depth++
  }

  const fallback = segments.join(" > ")
  return fallback && isUniqueSelector(fallback) ? fallback : null
}

function isUniqueSelector(selector: string): boolean {
  try {
    return querySelectorAllDeep(selector).length === 1
  } catch {
    return false
  }
}

function querySelectorDeep(selector: string): HTMLElement | null {
  try {
    for (const root of getSearchRoots()) {
      const found = root.querySelector(selector)
      if (found instanceof HTMLElement && !isOwnElement(found)) return found
    }
  } catch {
    return null
  }

  return null
}

function querySelectorAllDeep(selector: string): HTMLElement[] {
  const results: HTMLElement[] = []

  for (const root of getSearchRoots()) {
    try {
      root.querySelectorAll(selector).forEach((node) => {
        if (node instanceof HTMLElement && !isOwnElement(node)) {
          results.push(node)
        }
      })
    } catch {
      // Ignore invalid selectors.
    }
  }

  return results
}

function getSearchRoots(): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [document]
  const queue: Element[] = Array.from(document.children)

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    if (current instanceof HTMLElement && current.shadowRoot) {
      roots.push(current.shadowRoot)
      queue.push(...Array.from(current.shadowRoot.children))
    }

    queue.push(...Array.from(current.children))
  }

  return roots
}

function scoreCandidate(candidate: HTMLElement, locator: ElementLocator): number {
  let score = 0

  if (locator.text) {
    const candidateText = normalizeText(candidate.textContent)
    if (candidateText === locator.text) {
      score += 12
    } else if (candidateText.includes(locator.text) || locator.text.includes(candidateText)) {
      score += 4
    }
  }

  if (locator.classes?.length) {
    const classList = new Set(Array.from(candidate.classList))
    for (const cls of locator.classes) {
      if (classList.has(cls)) {
        score += 3
      }
    }
  }

  if (locator.position) {
    const rect = candidate.getBoundingClientRect()
    const dx = rect.left + window.scrollX - locator.position.x
    const dy = rect.top + window.scrollY - locator.position.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance <= 24) {
      score += 10
    } else if (distance <= 80) {
      score += 6
    } else if (distance <= 160) {
      score += 2
    } else {
      score -= Math.min(distance / 100, 8)
    }
  }

  return score
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function isOwnElement(element: HTMLElement): boolean {
  return Boolean(element.closest("[data-agentation-root], [data-annotation-marker]"))
}

function isStableClass(value: string): boolean {
  return ![
    /^hover:/,
    /^focus:/,
    /^active:/,
    /^disabled:/,
    /^transition/,
    /^duration/,
    /^ease/,
    /^[a-z0-9]{8,}$/,
    /--/,
    /\[.*\]/,
  ].some((pattern) => pattern.test(value))
}

function isBoundingBox(value: unknown): value is BoundingBox {
  if (!value || typeof value !== "object") return false

  const box = value as Partial<BoundingBox>
  return isFiniteNumber(box.x)
    && isFiniteNumber(box.y)
    && isFiniteNumber(box.width)
    && isFiniteNumber(box.height)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
