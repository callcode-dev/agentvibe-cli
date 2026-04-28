import type { MeResponse } from "../api-types.js";
import { createClient, parseJsonResponse } from "../client.js";

export async function whoami(): Promise<void> {
  const { auth, client } = createClient();
  const me = await parseJsonResponse<MeResponse>(await client.api.me.$get({}));
  console.log(
    JSON.stringify(
      {
        authSource: auth.source,
        baseUrl: auth.baseUrl,
        account: me.account,
      },
      null,
      2,
    ),
  );
}
