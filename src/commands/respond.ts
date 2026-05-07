import { writeResponseFile } from "../lib/responseFile.js";

export async function respond(argv: string[]): Promise<void> {
  let text: string | undefined;
  let quiet = false;
  let file = process.env.AGENTVIBE_RESPONSE_FILE;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quiet") quiet = true;
    else if (a === "--file") file = argv[++i];
    else if (!a.startsWith("--") && text === undefined) text = a;
  }
  if (!text) {
    console.error('Usage: agentvibe respond [--quiet] "<text>"');
    process.exit(1);
  }
  if (!file) {
    console.error(
      "AGENTVIBE_RESPONSE_FILE not set and no --file provided. " +
        "This subcommand is intended for use inside `agentvibe listen` spawns.",
    );
    process.exit(1);
  }
  await writeResponseFile(file, {
    mode: "respond",
    text,
    ...(quiet ? { quiet: true } : {}),
  });
  console.log(`Recorded ${quiet ? "quiet " : ""}reply (${text.length} chars).`);
}
