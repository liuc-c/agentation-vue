<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from "vue"
import {
  getForensicComputedStyles,
  parseComputedStylesString,
  type AnnotationV2,
} from "@liuovo/agentation-vue-core"
import {
  ANNOTATIONS_STORE_KEY,
  I18N_KEY,
  OVERLAY_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
} from "../injection-keys.js"
import { injectStrict } from "../utils.js"
import { originalSetTimeout } from "../composables/useFreezeState.js"
import { IconTrashAlt } from "./icons.js"

const store = injectStrict(ANNOTATIONS_STORE_KEY, "annotations store")
const selection = injectStrict(SELECTION_KEY, "selection state")
const overlay = injectStrict(OVERLAY_KEY, "overlay state")
const settings = injectStrict(SETTINGS_KEY, "settings state")
const i18n = injectStrict(I18N_KEY, "i18n state")

const comment = ref("")
const stylesExpanded = ref(false)
const shaking = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const messages = computed(() => i18n.messages)

const snapshot = computed(() => selection.selected)
const position = computed(() => overlay.popoverPosition)
const editingAnnotation = computed(() => overlay.editingAnnotation)

const isCreateMode = computed(
  () => overlay.popoverVisible && snapshot.value !== null && position.value !== null && !editingAnnotation.value,
)

const isEditMode = computed(
  () => overlay.popoverVisible && editingAnnotation.value !== null && position.value !== null,
)

const isOpen = computed(() => isCreateMode.value || isEditMode.value)

const accentColor = computed(() => {
  return isMultiSelect(editingAnnotation.value)
    || snapshot.value?.isMultiSelect
    ? "#34C759"
    : settings.annotationColor
})

const popoverStyle = computed(() => {
  const pos = position.value
  if (!pos) return undefined

  return {
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    "--ag-popover-accent": accentColor.value,
  }
})

const displayName = computed(() => {
  if (editingAnnotation.value) return editingAnnotation.value.elementSelector
  return snapshot.value?.elementName ?? ""
})

const displaySource = computed(() => {
  if (!settings.componentSourceEnabled) return ""

  if (editingAnnotation.value) {
    const src = editingAnnotation.value.source
    return src.file
      ? (src.line ? `${src.file}:${src.line}` : src.file)
      : ""
  }

  return snapshot.value?.source.file
    ? (snapshot.value.source.line
      ? `${snapshot.value.source.file}:${snapshot.value.source.line}`
      : snapshot.value.source.file)
    : ""
})

const selectedText = computed(() => {
  return editingAnnotation.value?.elementText ?? snapshot.value?.selectedText ?? ""
})

const computedStyles = computed(() => {
  if (editingAnnotation.value) {
    return getAnnotationComputedStyles(editingAnnotation.value)
  }

  const selectedElement = snapshot.value?.element
  if (!selectedElement) return undefined

  return parseComputedStylesString(getForensicComputedStyles(selectedElement))
})

const styleEntries = computed(() => Object.entries(computedStyles.value ?? {}))
const hasComputedStyles = computed(() => styleEntries.value.length > 0)

let shakeTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [isOpen, () => editingAnnotation.value?.id, () => snapshot.value?.element],
  async ([open]) => {
    if (!open) {
      comment.value = ""
      stylesExpanded.value = false
      return
    }

    comment.value = editingAnnotation.value?.comment ?? ""
    stylesExpanded.value = false

    await nextTick()
    focusTextarea()
  },
  { immediate: true },
)

watch(
  () => overlay.shakeTick ?? 0,
  (tick, previousTick) => {
    if (!isOpen.value) return
    if (tick === previousTick) return
    shake()
  },
)

onBeforeUnmount(() => {
  if (shakeTimer) {
    window.clearTimeout(shakeTimer)
  }
})

function save(): void {
  const trimmed = comment.value.trim()
  if (!trimmed) return

  if (editingAnnotation.value) {
    try {
      store.updateAnnotation(editingAnnotation.value.id, trimmed)
    } catch (err) {
      console.warn("[agentation] Failed to update annotation:", err)
      return
    }
  } else {
    const snap = snapshot.value
    if (!snap) return

    try {
      store.saveAnnotation(trimmed, snap)
    } catch (err) {
      console.warn("[agentation] Failed to save annotation:", err)
      return
    }
  }

  dismiss()
}

function deleteAnnotation(): void {
  if (!editingAnnotation.value) return
  store.removeAnnotation(editingAnnotation.value.id)
  dismiss()
}

function dismiss(): void {
  comment.value = ""
  stylesExpanded.value = false
  selection.clearSelection()
  overlay.hidePopover()
}

function focusTextarea(): void {
  const textarea = textareaRef.value
  if (!textarea) return
  textarea.focus()
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length
  textarea.scrollTop = textarea.scrollHeight
}

function shake(): void {
  if (shakeTimer) {
    window.clearTimeout(shakeTimer)
  }

  shaking.value = false

  void nextTick(() => {
    shaking.value = true
    shakeTimer = originalSetTimeout(() => {
      shaking.value = false
      focusTextarea()
      shakeTimer = null
    }, 250)
  })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault()
    save()
  }

  if (event.key === "Escape") {
    event.preventDefault()
    dismiss()
  }
}

function isMultiSelect(annotation: AnnotationV2 | null): boolean {
  const metadata = annotation?.metadata as { isMultiSelect?: unknown } | undefined
  return metadata?.isMultiSelect === true
}

function getAnnotationComputedStyles(annotation: AnnotationV2): Record<string, string> | undefined {
  const metadata = annotation.metadata as { computedStyles?: unknown } | undefined
  const raw = metadata?.computedStyles

  if (typeof raw === "string") {
    return parseComputedStylesString(raw)
  }

  if (raw && typeof raw === "object") {
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    )
  }

  return undefined
}
</script>

<template>
  <Transition name="popover">
    <div
      v-if="isOpen"
      class="popover"
      :class="{ light: !settings.darkMode, shaking }"
      :style="popoverStyle"
      data-annotation-popup
      @click.stop
    >
      <div class="header">
        <button
          v-if="hasComputedStyles"
          class="header-toggle"
          type="button"
          :aria-expanded="stylesExpanded"
          @click="stylesExpanded = !stylesExpanded"
        >
          <svg
            class="chevron"
            :class="{ expanded: stylesExpanded }"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5.5 10.25L9 7.25L5.75 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="element-name">{{ displayName }}</span>
        </button>

        <span v-else class="element-name">{{ displayName }}</span>
      </div>

      <div v-if="displaySource" class="source-file">
        {{ displaySource }}
      </div>

      <div
        v-if="hasComputedStyles"
        class="styles-wrapper"
        :class="{ expanded: stylesExpanded }"
      >
        <div class="styles-inner">
          <div class="styles-block">
            <div
              v-for="[property, value] in styleEntries"
              :key="property"
              class="style-line"
            >
              <span class="style-property">{{ property }}</span>
              :
              <span class="style-value">{{ value }}</span>;
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedText" class="quote">
        &ldquo;{{ selectedText.slice(0, 80) }}{{ selectedText.length > 80 ? "..." : "" }}&rdquo;
      </div>

      <textarea
        ref="textareaRef"
        v-model="comment"
        class="textarea"
        rows="2"
        :placeholder="editingAnnotation ? messages.popover.editPlaceholder : messages.popover.createPlaceholder"
        @keydown="onKeydown"
      />

      <div class="actions">
        <div class="delete-wrapper">
          <button
            v-if="editingAnnotation"
            class="delete-button"
            type="button"
            :title="messages.popover.deleteAnnotation"
            :aria-label="messages.popover.deleteAnnotation"
            @click="deleteAnnotation"
          >
            <IconTrashAlt :size="22" />
          </button>
        </div>

        <button class="btn-ghost" type="button" @click="dismiss">
          {{ messages.popover.cancel }}
        </button>

        <button
          class="btn-primary"
          type="button"
          :disabled="!comment.trim()"
          :style="{ backgroundColor: accentColor }"
          @click="save"
        >
          {{ editingAnnotation ? messages.popover.update : messages.popover.save }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
:deep(svg[fill="none"]) { fill: none !important; }

@keyframes popoverShake {
  0%, 100% { transform: scale(1) translateX(0); }
  20% { transform: scale(1) translateX(-3px); }
  40% { transform: scale(1) translateX(3px); }
  60% { transform: scale(1) translateX(-2px); }
  80% { transform: scale(1) translateX(2px); }
}

.popover {
  position: fixed;
  z-index: 100001;
  width: 280px;
  padding: 12px 16px 14px;
  border-radius: 16px;
  background: #1a1a1a;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  pointer-events: auto;
  cursor: default;
  will-change: transform, opacity;
}

.popover.light {
  background: #ffffff;
  box-shadow:
    0 4px 24px rgba(15, 23, 42, 0.12),
    0 0 0 1px rgba(15, 23, 42, 0.06);
  color: rgba(15, 23, 42, 0.92);
}

.popover.shaking {
  animation: popoverShake 0.25s ease-out;
}

.popover-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.2s ease;
}

.popover-leave-active {
  transition:
    opacity 0.15s ease-in,
    transform 0.15s ease-in,
    filter 0.15s ease-in;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(4px);
  filter: blur(4px);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.header-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.element-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.56);
}

.light .element-name {
  color: rgba(15, 23, 42, 0.62);
}

.chevron {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.48);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.chevron.expanded {
  transform: rotate(90deg);
}

.light .chevron {
  color: rgba(15, 23, 42, 0.4);
}

.source-file {
  margin-bottom: 8px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.38);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  word-break: break-all;
}

.light .source-file {
  color: rgba(15, 23, 42, 0.42);
}

.styles-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.styles-wrapper.expanded {
  grid-template-rows: 1fr;
}

.styles-inner {
  overflow: hidden;
}

.styles-block {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

.light .styles-block {
  background: rgba(15, 23, 42, 0.03);
}

.style-line {
  color: rgba(255, 255, 255, 0.85);
  word-break: break-word;
}

.light .style-line {
  color: rgba(15, 23, 42, 0.76);
}

.style-property {
  color: #c792ea;
}

.light .style-property {
  color: #7c3aed;
}

.style-value {
  color: inherit;
  margin-left: 2px;
}

.quote {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-style: italic;
  line-height: 1.45;
}

.light .quote {
  background: rgba(15, 23, 42, 0.04);
  color: rgba(15, 23, 42, 0.58);
}

.textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  resize: none;
  outline: none;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.textarea::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.textarea:focus {
  border-color: var(--ag-popover-accent, #3c82f7);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ag-popover-accent, #3c82f7) 18%, transparent);
}

.light .textarea {
  background: rgba(15, 23, 42, 0.03);
  color: #1a1a1a;
  border-color: rgba(15, 23, 42, 0.12);
}

.light .textarea::placeholder {
  color: rgba(15, 23, 42, 0.38);
}

.textarea::-webkit-scrollbar {
  width: 6px;
}

.textarea::-webkit-scrollbar-track {
  background: transparent;
}

.textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.light .textarea::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.15);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.delete-wrapper {
  margin-right: auto;
}

.delete-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.delete-button:hover {
  background: rgba(255, 59, 48, 0.25);
  color: #ff3b30;
}

.delete-button:active {
  transform: scale(0.92);
}

.light .delete-button {
  color: rgba(15, 23, 42, 0.42);
}

.light .delete-button:hover {
  background: rgba(255, 59, 48, 0.14);
}

.btn-ghost,
.btn-primary {
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease,
    transform 0.1s ease,
    filter 0.15s ease;
}

.btn-ghost {
  background: transparent;
  color: rgba(255, 255, 255, 0.52);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.82);
}

.light .btn-ghost {
  color: rgba(15, 23, 42, 0.5);
}

.light .btn-ghost:hover {
  background: rgba(15, 23, 42, 0.06);
  color: rgba(15, 23, 42, 0.76);
}

.btn-primary {
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(0.94);
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
