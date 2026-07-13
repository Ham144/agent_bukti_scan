#!/usr/bin/env node
import { loadAgentEnv } from "./core/env-loader";
import { loadConfig } from "./core/config-store";
import { AgentRuntime } from "./core/runtime";

loadAgentEnv();

async function main() {
  const config = loadConfig();
  const runtime = new AgentRuntime(config);

  if (!config.deviceToken) {
    process.stderr.write(
      "Agent belum dipairing. Jalankan dengan Electron UI atau set config.json.\n",
    );
    process.exit(1);
  }

  await runtime.start();

  process.on("SIGINT", async () => {
    await runtime.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "Fatal error"}\n`);
  process.exit(1);
});
