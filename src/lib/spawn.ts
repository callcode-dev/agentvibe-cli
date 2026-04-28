import { spawn as nodeSpawn } from "child_process";

export interface SpawnOptions {
  command: string;
  input: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export function spawnAgent(opts: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = nodeSpawn(opts.command, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      // Force kill after 3 seconds if SIGTERM doesn't work
      killTimer = setTimeout(() => proc.kill("SIGKILL"), 3000);
    }, opts.timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        stdout,
        stderr: stderr + err.message,
        exitCode: 1,
        timedOut: false,
      });
    });

    if (opts.input) {
      proc.stdin.write(opts.input);
    }
    proc.stdin.end();
  });
}
