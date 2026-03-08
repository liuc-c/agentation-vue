export * from "./element-identification.js"
// NOTE: freeze-animations.ts is intentionally NOT re-exported here.
// It installs global monkey-patches as a side effect of import.
// Consumers should import it explicitly when needed:
//   import { freeze, unfreeze } from "@liuovo/agentation-vue-core/dom/freeze-animations"
