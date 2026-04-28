import { runtimeSummary } from "../runtime.js";

export async function context(): Promise<void> {
  console.log(JSON.stringify(runtimeSummary(), null, 2));
}
