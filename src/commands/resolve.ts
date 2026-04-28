import { loadRuntime, resolveRuntimeTarget } from "../runtime.js";

export async function resolve(argv: string[]): Promise<void> {
  const name = argv.join(" ").trim();
  if (!name) {
    console.error("Usage: agentvibe resolve <person|agent|channel>");
    process.exit(1);
  }

  const runtime = loadRuntime();
  const resolved = resolveRuntimeTarget(name, runtime.context);
  if (!resolved) {
    console.error(`Could not resolve ${JSON.stringify(name)} from AgentVibe runtime context`);
    process.exit(1);
  }

  console.log(JSON.stringify(resolved, null, 2));
}
