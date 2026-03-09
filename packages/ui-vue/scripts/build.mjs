import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { copyVueDtsFiles } from "./copy-vue-dts.mjs"

const rootDir = resolve(import.meta.dirname, "..")
const patchScript = resolve(import.meta.dirname, "./inject-css-import.mjs")

function bin(name) {
  return process.platform === "win32" ? `${name}.cmd` : name
}

function run(command, args, cwd = rootDir) {
  execFileSync(command, args, {
    stdio: "inherit",
    env: process.env,
    cwd,
  })
}

run(bin("vite"), ["build"])
run(bin("tsc"), ["-p", "tsconfig.json", "--emitDeclarationOnly"])
await copyVueDtsFiles()
run(process.execPath, [patchScript])
