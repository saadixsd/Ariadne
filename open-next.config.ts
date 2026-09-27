import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();
// Invoke Next directly. OpenNext's default is `npm run build`, which loops if
// that script is the OpenNext build and can deadlock npm during postinstall.
config.buildCommand = "node ./node_modules/next/dist/bin/next build";

export default config;
