import { writeResponseFile } from "../lib/responseFile.js";

export async function silence(argv: string[]): Promise<void> {
  let file = process.env.AGENTVIBE_RESPONSE_FILE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
  }
  if (!file) {
    console.error(
      "AGENTVIBE_RESPONSE_FILE not set and no --file provided. " +
        "This subcommand is intended for use inside `agentvibe listen` spawns.",
    );
    process.exit(1);
  }
  await writeResponseFile(file, { mode: "silence" });
  console.log("Recorded silence.");
}
