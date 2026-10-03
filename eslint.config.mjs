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
    // Generated Cloudflare bundles (opennextjs-cloudflare / wrangler): huge, not source.
    ".open-next/**",
    ".wrangler/**",
    // The early-access page is its own Worker with its own tooling (landing/README.md).
    "landing/**",
  ]),
]);

export default eslintConfig;
