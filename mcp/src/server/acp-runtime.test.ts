import { describe, expect, it } from "vitest"
import type { PermissionOption } from "@agentclientprotocol/sdk"
import { selectPermissionResponse } from "./acp-runtime.js"

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
