// Client HTTP ntfy : POST {server}/{topic} en JSON.
// Ne lève jamais : tout échec est journalisé et retourne false.
// Le token n'est jamais journalisé.

import type { NtfyConfig } from "./config.js";

export interface NtfyPayload {
  readonly title: string;
  readonly message: string;
  readonly priority: number;
  readonly tags: readonly string[];
  readonly click?: string | undefined;
}

/** Timeout court : une notif ne doit jamais bloquer l'agent. */
const REQUEST_TIMEOUT_MS = 7_000;

export function ntfyUrl(config: Pick<NtfyConfig, "server" | "topic">): string {
  return `${config.server.replace(/\/+$/, "")}/${config.topic}`;
}

export async function sendNtfy(
  config: NtfyConfig,
  payload: NtfyPayload,
): Promise<boolean> {
  if (!config.enabled || config.quiet) return false;

  if (config.dryRun) {
    console.log(
      `[ntfy-notify] dry-run → ${ntfyUrl(config)} : ${payload.title} — ${payload.message}`,
    );
    return true;
  }

  const body: Record<string, unknown> = {
    topic: config.topic,
    title: payload.title,
    message: payload.message,
    priority: payload.priority,
    tags: [...payload.tags],
  };
  const click = payload.click ?? config.click;
  if (click !== undefined && click !== "") body["click"] = click;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.token !== undefined && config.token !== "") {
      headers["Authorization"] = `Bearer ${config.token}`;
    }
    const response = await fetch(ntfyUrl(config), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[ntfy-notify] envoi refusé : HTTP ${response.status} (${ntfyUrl(config)})`);
      return false;
    }
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[ntfy-notify] envoi impossible (${ntfyUrl(config)}) : ${reason}`);
    return false;
  }
}
