// Harnais de test local : un faux contexte opencode + un faux serveur ntfy
// qui compte les notifications. Aucun opencode n'est lancé, aucun réseau
// extérieur n'est touché (le serveur écoute sur 127.0.0.1, port éphémère).
//
// Ce module ne fait QUE du test : il n'est jamais compilé dans `dist/`
// (exclu de `tsconfig.build.json`), seulement dans `.test-build/` via
// `tsconfig.test.json`.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import plugin from "../src/index.js";
import type {
  CommandDefinition,
  CommandEditor,
  PermissionEvaluation,
  PluginContext,
  PluginEvent,
  PluginOptions,
  Registration,
  ToolDefinition,
  ToolEditor,
} from "../src/types.js";

/** Notification telle que reçue par le faux serveur (corps JSON du POST). */
export interface SentNotification {
  readonly topic: string;
  readonly title: string;
  readonly message: string;
  readonly priority: number;
  readonly tags: readonly string[];
}

export const TEST_PROJECT = "mon-projet";
export const TEST_TOPIC = "test-topic";

/** Serveur ntfy local : enregistre chaque POST reçu, ne répond rien d'utile. */
export interface FakeNtfyServer {
  readonly url: string;
  readonly sent: readonly SentNotification[];
  close(): Promise<void>;
}

export async function startFakeNtfyServer(): Promise<FakeNtfyServer> {
  const sent: SentNotification[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        sent.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as SentNotification);
      } catch {
        // Corps illisible : on n'enregistre rien, le test le verra.
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    sent,
    async close() {
      // Sans ça, `close` attend les connexions keep-alive de fetch et bloque.
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

interface PendingEvent {
  readonly event: PluginEvent;
  /** Résolue quand le plugin a fini de traiter l'event (garantie d'ordre). */
  readonly settled: () => void;
}

/**
 * Flux d'events contrôlable : `push` se résout une fois l'event réellement
 * traité par le plugin, ce qui rend les tests déterministes (pas de sleep).
 */
class EventBus {
  private readonly pending: PendingEvent[] = [];
  private readonly waiters: Array<() => void> = [];
  private closed = false;

  push(event: PluginEvent): Promise<void> {
    if (this.closed) return Promise.reject(new Error("bus d'events fermé"));
    let settled: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      settled = resolve;
    });
    this.pending.push({ event, settled });
    this.wake();
    return done;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.wake();
  }

  private wake(): void {
    for (const waiter of this.pending.length > 0 ? this.waiters.splice(0) : []) waiter();
  }

  private shift(): Promise<PendingEvent | undefined> {
    const head = this.pending.shift();
    if (head !== undefined) return Promise.resolve(head);
    if (this.closed) return Promise.resolve(undefined);
    return new Promise<PendingEvent | undefined>((resolve) => {
      this.waiters.push(() => {
        resolve(this.pending.shift());
      });
    });
  }

  subscribe(options?: { readonly signal?: AbortSignal | undefined }): AsyncIterable<PluginEvent> {
    // L'avort du plugin (cleanup) ferme le bus : la boucle `for await` du
    // plugin se termine alors au lieu de boucler sur une reconnexion.
    const signal = options?.signal;
    if (signal !== undefined) signal.addEventListener("abort", () => this.close(), { once: true });
    return this.iterate();
  }

  private async *iterate(): AsyncGenerator<PluginEvent> {
    for (;;) {
      const item = await this.shift();
      if (item === undefined) return;
      yield item.event;
      // Le consommateur a repris la main : son `dispatchEvent` est fini.
      item.settled();
    }
  }
}

export interface HarnessOptions {
  /** Options passées telles quelles dans `ctx.options`. */
  readonly options?: PluginOptions | undefined;
  /** Titres de session connus de `ctx.session.get()`. */
  readonly sessionTitles?: Readonly<Record<string, string>> | undefined;
  /** Titre de session par défaut quand la session est inconnue. */
  readonly unknownSessionTitle?: string | undefined;
}

export interface PluginHarness {
  /** Notifications effectivement reçues par le faux serveur. */
  readonly sent: readonly SentNotification[];
  /** Émet un event et attend qu'il soit traité (ou ignoré) par le plugin. */
  emit(event: PluginEvent): Promise<void>;
  /** Simule le hook permission "evaluate" (utilisé par les tests de régression). */
  evaluatePermission(event: PermissionEvaluation): Promise<void>;
  stop(): Promise<void>;
}

/** Plugin démarré sur un faux contexte, avec un faux serveur ntfy. */
export async function startPlugin(opts: HarnessOptions = {}): Promise<PluginHarness> {
  const server = await startFakeNtfyServer();
  const bus = new EventBus();
  const titles: Readonly<Record<string, string>> = opts.sessionTitles ?? {};
  const unknownTitle = opts.unknownSessionTitle;
  const permissionCallbacks: Array<(event: PermissionEvaluation) => void> = [];

  const dispose = async (): Promise<void> => {};

  const ctx: PluginContext = {
    app: { name: "opencode", version: "2.0.19", channel: "test" },
    location: {
      directory: `/home/user/dev/${TEST_PROJECT}`,
      project: {
        id: "prj_test",
        directory: `/home/user/dev/${TEST_PROJECT}`,
        canonical: `/home/user/dev/${TEST_PROJECT}`,
      },
    },
    options: {
      server: server.url,
      topic: TEST_TOPIC,
      quiet: false,
      dryRun: false,
      ...opts.options,
    },
    permission: {
      async hook(_name, callback) {
        permissionCallbacks.push(callback);
        return { dispose } satisfies Registration;
      },
    },
    event: { subscribe: (options) => bus.subscribe(options) },
    session: {
      async get({ sessionID }) {
        const title = titles[sessionID] ?? unknownTitle;
        return title !== undefined ? { title } : {};
      },
    },
    tool: {
      async transform(callback: (editor: ToolEditor) => void) {
        callback({ add: (_definition: ToolDefinition) => {} });
        return { dispose } satisfies Registration;
      },
    },
    command: {
      async transform(callback: (editor: CommandEditor) => void) {
        callback({ add: (_definition: CommandDefinition) => {} });
        return { dispose } satisfies Registration;
      },
    },
  };

  const cleanup = await plugin.setup(ctx);
  const stop = async (): Promise<void> => {
    if (typeof cleanup === "function") await cleanup();
    bus.close();
    await server.close();
  };

  return {
    sent: server.sent,
    emit: (event) => bus.push(event),
    async evaluatePermission(event) {
      for (const callback of permissionCallbacks) {
        await callback(event);
      }
    },
    stop,
  };
}

/**
 * Assertion utilitaire : « exactement une notification ».
 * Utilisée par les tests de dédup (un rejeu ne doit pas doubler).
 */
export function onlyOne(sent: readonly SentNotification[]): SentNotification {
  if (sent.length !== 1) {
    throw new Error(
      `attendu 1 notification, reçu ${sent.length} : ${JSON.stringify(sent.map((n) => n.title))}`,
    );
  }
  const first = sent[0];
  if (first === undefined) throw new Error("notification vide");
  return first;
}
