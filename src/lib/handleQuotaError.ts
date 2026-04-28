import { QuotaExceededError } from "agentvibe-sdk";

/**
 * If the error is a QuotaExceededError, prints a friendly message and
 * returns true; the caller should exit with a non-zero code.
 * Otherwise returns false — caller should re-throw.
 */
export function handleQuotaError(err: unknown): boolean {
  if (err instanceof QuotaExceededError) {
    console.error(`✗ ${err.message}`);
    console.error(`  Upgrade at ${err.upgradeUrl}`);
    return true;
  }
  return false;
}
