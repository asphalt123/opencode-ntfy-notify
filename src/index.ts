// Plugin OpenCode v2 : notifications ntfy.
// API v2 uniquement : default export `{ id, setup }` + setup(ctx).
// Pas de server(), pas de @opencode-ai/plugin.
//
// ⚠️ NE PAS importer `@opencode/plugin` dans ce fichier (ni dans ses imports).
// Le plugin est chargé depuis un dossier sans `node_modules` : l'import échoue
// silencieusement et opencode ne charge rien. `Plugin.define()` est de toute
// façon un simple `identity`, le default export ci-dessous est équivalent.
// Le contexte est typé en local via `src/types.ts` (validé contre l'API v2
// réelle par `typecheck/conformance.ts`).
//
// Déclencheurs :
//  1. tâche terminée      -> event `session.execution.succeeded` (voir dispatchEvent)
//  2. permission demandée -> hook permission "evaluate" (effect === "ask"),
//                            secours via l'event `permission.asked`
//  3. question de l'agent -> event `form.created` (jamais `form.replied`/`form.cancelled`)
//  4. erreur bloquante    -> events `session.execution.failed` + `session.step.failed`
//
// Le plugin est un observateur : il ne modifie jamais effect/message et ne lève
// jamais depuis un hook ou le subscriber d'events.

import { resolveConfig, summarizeConfig, type NtfyConfig } from "./config.js";
import { sendNtfy } from "./ntfy.js";
import { createTestCommandDefinition, createTestToolDefinition } from "./definitions.js";
import {
  Deduper,
  PermissionHookTracker,
  SessionActivity,
  completeKey,
  errorKey,
  permissionAskedKey,
  permissionHookKey,
  questionKey,
} from "./state.js";
import {
  formatCompleted,
  formatError,
  formatPermission,
  formatQuestion,
  projectName,
} from "./format.js";
import type { FormLike, PluginContext, PluginDefinition, PluginEvent } from "./types.js";

interface Deps {
  readonly ctx: PluginContext;
  readonly config: NtfyConfig;
  readonly project: string;
  readonly deduper: Deduper;
  readonly activity: SessionActivity;
  readonly permHooks: PermissionHookTracker;
}

interface PermissionAskInput {
  readonly sessionID: string;
  readonly action: string;
  readonly resources: readonly string[];
  readonly message?: string | undefined;
}

const BACKOFFS_MS = [2_000, 5_000, 10_000, 30_000];

/**
 * `true` si le serveur ntfy est l'hôte public ntfy.sh (ou un sous-domaine).
 * Une URL illisible ne doit pas faire planter le plugin au démarrage.
 */
function isPublicNtfyHost(server: string): boolean {
  try {
    const hostname = new URL(server).hostname.toLowerCase();
    return hostname === "ntfy.sh" || hostname.endsWith(".ntfy.sh");
  } catch {
    return false;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Titre de session (best effort) : repli silencieux si la session a disparu. */
async function getSessionTitle(
  ctx: PluginContext,
  sessionID: string,
): Promise<string | undefined> {
  try {
    const info = await ctx.session.get({ sessionID });
    return info.title !== undefined && info.title.trim() !== "" ? info.title : undefined;
  } catch {
    return undefined;
  }
}

async function notifyCompleted(deps: Deps, sessionID: string): Promise<void> {
  try {
    if (!deps.config.notifyOnComplete) return;
    if (!deps.activity.has(sessionID)) return; // pas d'activité réelle : pas de bruit
    deps.activity.clear(sessionID);
    if (deps.deduper.check(completeKey(sessionID))) return;
    const title = await getSessionTitle(deps.ctx, sessionID);
    await sendNtfy(deps.config, {
      ...formatCompleted(deps.project, deps.config.verbosity, title),
      priority: deps.config.priorityCompleted,
    });
  } catch (error) {
    console.error(`[ntfy-notify] notifyCompleted ignoré : ${String(error)}`);
  }
}

async function notifyPermissionFromHook(deps: Deps, ask: PermissionAskInput): Promise<void> {
  try {
    if (!deps.config.notifyOnPermission) return;
    deps.activity.mark(ask.sessionID);
    if (deps.deduper.check(permissionHookKey(ask.sessionID, ask.action, ask.resources))) {
      return;
    }
    deps.permHooks.noteHook(ask.sessionID);
    const title = await getSessionTitle(deps.ctx, ask.sessionID);
    await sendNtfy(deps.config, {
      ...formatPermission(
        deps.project,
        deps.config.verbosity,
        ask.action,
        ask.resources,
        title,
        ask.message,
      ),
      priority: deps.config.priorityPermission,
    });
  } catch (error) {
    console.error(`[ntfy-notify] notifyPermission ignoré : ${String(error)}`);
  }
}

async function notifyPermissionFallback(
  deps: Deps,
  sessionID: string,
  requestID: string,
  action: string,
  resources: readonly string[],
  message?: string,
): Promise<void> {
  try {
    if (!deps.config.notifyOnPermission) return;
    if (deps.permHooks.hasRecent(sessionID, deps.config.dedupeWindowMs)) return; // hook déjà notifié
    if (deps.deduper.check(permissionAskedKey(sessionID, requestID))) return;
    const title = await getSessionTitle(deps.ctx, sessionID);
    await sendNtfy(deps.config, {
      ...formatPermission(
        deps.project,
        deps.config.verbosity,
        action,
        resources,
        title,
        message,
      ),
      priority: deps.config.priorityPermission,
    });
  } catch (error) {
    console.error(`[ntfy-notify] notifyPermissionFallback ignoré : ${String(error)}`);
  }
}

async function notifyError(
  deps: Deps,
  sessionID: string,
  errorType: string,
  errorMessage: string,
): Promise<void> {
  try {
    if (!deps.config.notifyOnError) return;
    if (deps.deduper.check(errorKey(sessionID))) return; // step.failed + execution.failed = 1 notif
    const title = await getSessionTitle(deps.ctx, sessionID);
    await sendNtfy(deps.config, {
      ...formatError(deps.project, deps.config.verbosity, errorType, errorMessage, title),
      priority: deps.config.priorityError,
    });
  } catch (error) {
    console.error(`[ntfy-notify] notifyError ignoré : ${String(error)}`);
  }
}

/** Vue défensive et normalisée de `data.form` (aucune propriété n'est lue telle quelle). */
interface QuestionForm {
  /** Clé de dédup : `id` du form, ou une clé de repli stable si `id` manque. */
  readonly key: string;
  /** Titre brut, pas encore nettoyé (c'est `formatQuestion` qui tronque). */
  readonly title: string | undefined;
  /** Nombre de champs, uniquement si `fields` est bien un tableau. */
  readonly fieldCount: number | undefined;
}

/**
 * Lecture **défensive** de `data.form` : ne lève jamais, n'accède jamais à la
 * structure profonde des champs (elle varie selon le provider de formulaire).
 * Renvoie `undefined` si l'event ne porte aucun formulaire exploitable — dans
 * ce cas on ne notifie pas plutôt que d'envoyer une notif vide.
 */
function readQuestionForm(
  form: FormLike | undefined,
  sessionID: string | undefined,
): QuestionForm | undefined {
  if (typeof form !== "object" || form === null) return undefined;
  const id = typeof form.id === "string" && form.id.trim() !== "" ? form.id.trim() : "";
  const title = typeof form.title === "string" ? form.title : undefined;
  const fieldCount = Array.isArray(form.fields) ? form.fields.length : undefined;
  // Repli déterministe quand `id` est absent : deux rejeux du même event
  // produisent la même clé, donc toujours une seule notification.
  const fallback = `${sessionID ?? ""}#${(title ?? "").slice(0, 80)}`;
  return { key: questionKey(id !== "" ? id : fallback), title, fieldCount };
}

async function notifyQuestion(
  deps: Deps,
  sessionID: string | undefined,
  form: FormLike | undefined,
): Promise<void> {
  try {
    const session = sessionID !== undefined && sessionID !== "" ? sessionID : undefined;
    // L'activité est marquée AVANT de regarder `notifyOnQuestion` : sans cela,
    // une session qui pose une question puis devient idle après la réponse
    // ne déclencherait jamais la notification « tâche terminée ».
    if (session !== undefined) deps.activity.mark(session);
    if (!deps.config.notifyOnQuestion) return;
    const parsed = readQuestionForm(form, session);
    if (parsed === undefined) return;
    if (deps.deduper.check(parsed.key)) return; // event rejoué = une seule notif
    const title = session !== undefined ? await getSessionTitle(deps.ctx, session) : undefined;
    await sendNtfy(deps.config, {
      ...formatQuestion(
        deps.project,
        deps.config.verbosity,
        parsed.title,
        parsed.fieldCount,
        title,
      ),
      priority: deps.config.priorityQuestion,
    });
  } catch (error) {
    console.error(`[ntfy-notify] notifyQuestion ignoré : ${String(error)}`);
  }
}

async function dispatchEvent(deps: Deps, event: PluginEvent): Promise<void> {
  switch (event.type) {
    case "session.execution.started":
    case "session.step.started":
    case "session.tool.called":
      deps.activity.mark(event.data.sessionID);
      return;
    case "session.execution.succeeded":
      // opencode v2 ne diffuse PAS `session.idle` sur le stream d'events :
      // une session se termine par `session.execution.succeeded` (vérifié sur
      // 2.0.19). C'est donc cet event qui déclenche la notification « tâche
      // terminée ». `session.idle` reste géré ci-dessous par sécurité, au cas
      // où une version ultérieure le réémettrait : la dédup TTL absorbe le
      // doublon.
      await notifyCompleted(deps, event.data.sessionID);
      return;
    case "session.idle":
      await notifyCompleted(deps, event.data.sessionID);
      return;
    case "permission.asked":
      await notifyPermissionFallback(
        deps,
        event.data.sessionID,
        event.data.id,
        event.data.action,
        event.data.resources,
        event.data.message,
      );
      return;
    case "session.execution.failed":
    case "session.step.failed":
      await notifyError(deps, event.data.sessionID, event.data.error.type, event.data.error.message);
      return;
    case "form.created": {
      // Le `sessionID` n'est pas à la racine de l'event : il vit dans le form.
      const raw = event.data.form;
      const sessionID =
        typeof raw === "object" && raw !== null && typeof raw.sessionID === "string"
          ? raw.sessionID
          : undefined;
      await notifyQuestion(deps, sessionID, raw);
      return;
    }
    case "form.replied":
    case "form.cancelled":
      // L'utilisateur vient d'agir : notifier ici ne servirait à rien.
      return;
    default:
      return;
  }
}

// Default export v2 : l'objet `{ id, setup }`, en pur JavaScript à l'exécution.
// Ne pas réintroduire `Plugin.define()` ici : l'import runtime de
// @opencode/plugin empêche le chargement sous v2 (voir README).
const plugin: PluginDefinition = {
  id: "ntfy-notify",
  async setup(ctx) {
    const config = resolveConfig(ctx.options);
    if (!config.enabled) {
      console.log("[ntfy-notify] désactivé (enabled=false), aucune notification ne sera envoyée.");
      return;
    }
    const project = projectName(ctx.location);
    console.log(`[ntfy-notify] actif : ${summarizeConfig(config)}`);

    // ntfy.sh est public : le topic est devinable et les messages sont lisibles
    // par quiconque. On prévient une seule fois si le contenu est tronqué.
    if (config.verbosity !== "full" && isPublicNtfyHost(config.server)) {
      console.log(
        `[ntfy-notify] ATTENTION : topic public ntfy.sh, contenu détaillé NON envoyé ` +
          `(verbosity=${config.verbosity}). Mets verbosity="full" ou un serveur ntfy privé ` +
          `si tu acceptes d'exposer le contenu de tes sessions.`,
      );
    }

    const deps: Deps = {
      ctx,
      config,
      project,
      deduper: new Deduper(config.dedupeWindowMs),
      activity: new SessionActivity(),
      permHooks: new PermissionHookTracker(),
    };

    // 2. Permission demandée (observateur : ne modifie ni effect ni message).
    await ctx.permission.hook("evaluate", (event) => {
      if (event.effect !== "ask") return;
      void notifyPermissionFromHook(deps, event);
    });

    // 1 + 3 + 4. Subscriber d'events avec reconnect + backoff.
    // L'abonnement est installé AVANT tout `await` bloquant : le contexte v2
    // n'émet aucun event rattrapage, donc un abonnement tardif perd les events
    // du tout premier tour de la session.
    const controller = new AbortController();
    void (async () => {
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
            if (controller.signal.aborted) break;
            failures = 0;
            try {
              await dispatchEvent(deps, event);
            } catch (error) {
              console.error(`[ntfy-notify] event ignoré : ${String(error)}`);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          failures += 1;
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[ntfy-notify] stream d'events interrompu (${reason}), reconnexion…`);
        }
        if (controller.signal.aborted) break;
        const backoff = BACKOFFS_MS[Math.min(failures, BACKOFFS_MS.length - 1)] ?? 30_000;
        try {
          await sleep(backoff, controller.signal);
        } catch {
          break;
        }
      }
    })();

    // Tool custom de test, accessible au modèle.
    await ctx.tool.transform((editor) => {
      editor.add(createTestToolDefinition(config, project));
    });

    // Commande /ntfy-test (debug manuel).
    await ctx.command.transform((editor) => {
      editor.add(createTestCommandDefinition(config, project));
    });

    return () => {
      controller.abort();
    };
  },
};

export default plugin;
