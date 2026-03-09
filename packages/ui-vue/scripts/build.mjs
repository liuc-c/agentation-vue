import { execFileSync } from "node:child_process"
import { patchBuiltEntry } from "./inject-css-import.mjs"
import { copyVueDtsFiles } from "./copy-vue-dts.mjs"

function bin(name) {
  return process.platform === "win32" ? `${name}.cmd` : name
}

function run(command, args) {
  execFileSync(command, args, {
    stdio: "inherit",
    env: process.env,
  })
}

run(bin("vite"), ["build"])
patchBuiltEntry()
run(bin("tsc"), ["-p", "tsconfig.json", "--emitDeclarationOnly"])
await copyVueDtsFiles()
