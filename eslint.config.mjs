import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-app code: design-reference prototypes and the standalone
    // preprocessing CLI are not part of the Next.js app and have their own
    // (intentionally loose) conventions — don't lint them.
    "design_handoff_color_gradle/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
