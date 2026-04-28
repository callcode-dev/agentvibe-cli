import { describeRuntime, loadRuntime } from "../runtime.js";

export async function context(): Promise<void> {
  console.log(JSON.stringify(describeRuntime(await loadRuntime()), null, 2));
}
