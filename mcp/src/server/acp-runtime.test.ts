import { describe, expect, it } from "vitest"
import type { PermissionOption } from "@agentclientprotocol/sdk"
import {
  buildSpawnOptions,
  selectPermissionResponse,
  shouldUseWindowsShell,
} from "./acp-runtime.js"

function option(
  optionId: string,
  kind: PermissionOption["kind"],
): PermissionOption {
  return {
    optionId,
    kind,
    name: optionId,
  }
}

describe("selectPermissionResponse", () => {
  it("prefers a one-time allow option when available", () => {
    const response = selectPermissionResponse([
      option("reject", "reject_once"),
      option("allow-always", "allow_always"),
      option("allow-once", "allow_once"),
    ])

    expect(response).toEqual({
      outcome: {
        outcome: "selected",
        optionId: "allow-once",
      },
    })
  })

  it("falls back to allow_always when no allow_once option exists", () => {
    const response = selectPermissionResponse([
      option("reject", "reject_once"),
      option("allow-always", "allow_always"),
    ])

    expect(response).toEqual({
      outcome: {
        outcome: "selected",
        optionId: "allow-always",
      },
    })
  })

  it("cancels when the agent only offers reject options", () => {
    const response = selectPermissionResponse([
      option("reject", "reject_once"),
      option("reject-always", "reject_always"),
    ])

    expect(response).toEqual({
      outcome: {
        outcome: "cancelled",
      },
    })
  })
})

describe("shouldUseWindowsShell", () => {
  it("enables shell mode for cmd and bat launchers on Windows", () => {
    expect(shouldUseWindowsShell("C:\\Program Files\\nodejs\\npx.CMD", "win32")).toBe(true)
    expect(shouldUseWindowsShell("C:\\tools\\agent.bat", "win32")).toBe(true)
  })

  it("keeps direct executables and non-Windows launchers unchanged", () => {
    expect(shouldUseWindowsShell("C:\\Program Files\\nodejs\\node.exe", "win32")).toBe(false)
    expect(shouldUseWindowsShell("/usr/bin/npx", "linux")).toBe(false)
  })
})

describe("buildSpawnOptions", () => {
  it("uses shell mode for Windows cmd launchers", () => {
    const options = buildSpawnOptions(
      "C:\\Program Files\\nodejs\\npx.CMD",
      "C:\\work\\demo",
      { OPENAI_API_KEY: "test-key" },
      "win32",
    )

    expect(options).toMatchObject({
      cwd: "C:\\work\\demo",
      stdio: "pipe",
      shell: true,
      windowsHide: true,
    })
    expect(options.env).toMatchObject({
      OPENAI_API_KEY: "test-key",
    })
  })

  it("avoids shell mode for direct executables", () => {
    const options = buildSpawnOptions(
      "/usr/bin/codex",
      "/tmp/demo",
      {},
      "linux",
    )

    expect(options).toMatchObject({
      cwd: "/tmp/demo",
      stdio: "pipe",
    })
    expect(options).not.toHaveProperty("shell")
    expect(options).not.toHaveProperty("windowsHide")
  })
})
