import { describeRuntime, loadRuntime, loadRuntimeContext } from "../runtime.js";

export async function context(): Promise<void> {
  try {
    console.log(JSON.stringify(describeRuntime(loadRuntime()), null, 2));
  } catch {
    const { context, source } = loadRuntimeContext();
    console.log(
      JSON.stringify(
        {
          authSource: null,
          baseUrl: null,
          contextSource: source,
          org: context.org ?? null,
          currentIdentity: context.currentIdentity ?? null,
          channels: Object.keys(context.channels ?? {}),
          targets: Object.keys(context.targets ?? {}),
        },
        null,
        2,
      ),
    );
  }
}
