// Vérifie que les types locaux de `src/types.ts` restent compatibles avec
// l'API OpenCode v2 réelle (`@opencode/plugin` 2.x).
//
// Ce fichier ne fait QUE du type-checking : il n'est jamais compilé dans `dist/`
// (exclu de `tsconfig.build.json`) et n'est jamais chargé à l'exécution.
// C'est le seul endroit du repo où `@opencode/plugin` est importé — et c'est
// un import de types, supprimé à la compilation.
//
// Si opencode change la forme du contexte, ce fichier casse le typecheck
// au lieu qu'on livre silencieusement un plugin cassé.

import type { Plugin } from "@opencode/plugin";
import { createTestCommandDefinition, createTestToolDefinition } from "../src/definitions.js";
import type { NtfyConfig } from "../src/config.js";
import type {
  AppInfo,
  CommandEditor,
  EventDomain,
  LocationInfo,
  PermissionDomain,
  PermissionEvaluation,
  PluginDefinition,
  PluginEvent,
  Registration,
  SessionDomain,
  ToolEditor,
} from "../src/types.js";

type Real = Plugin.Context;

/**
 * `true` si `A` est assignable à `B`, `false` sinon.
 * On renvoie `false` (et surtout pas `never`) : `never` satisfait n'importe
 * quelle contrainte et ferait passer le contrôle silencieusement.
 */
type Assignable<A, B> = [A] extends [B] ? true : false;

/** Échoue à la compilation si l'expression n'est pas littéralement `true`. */
type ExpectTrue<T extends true> = T;

/* ------------------------------------------------------------------ */
/* 1. Domaines du contexte : le vrai ctx est assignable au nôtre.       */
/*                                                                     */
/* On exclut `event` : notre `PluginEvent` est volontairement un       */
/* sous-ensemble de `V2Event` (le switch a un `default`), donc le flux */
/* réel n'est pas assignable au nôtre. C'est vérifié event par event  */
/* en section 3, qui est le contrôle qui compte.                       */
/* ------------------------------------------------------------------ */

export type _App = ExpectTrue<Assignable<Real["app"], AppInfo>>;
export type _Location = ExpectTrue<Assignable<Real["location"], LocationInfo>>;
export type _Permission = ExpectTrue<Assignable<Real["permission"], PermissionDomain>>;
export type _Session = ExpectTrue<Assignable<Real["session"], SessionDomain>>;

/* ------------------------------------------------------------------ */
/* 2. Le hook "evaluate" reçoit bien un PermissionEvaluation.          */
/* ------------------------------------------------------------------ */

// `Hooks<Spec>` est générique sur le nom du hook : `Parameters<…>` l'instancie
// sur son contrainte, ce qui donne le callback du hook "evaluate".
type RealEvaluation = Parameters<Parameters<Real["permission"]["hook"]>[1]>[0];

export type _Evaluation = ExpectTrue<Assignable<RealEvaluation, PermissionEvaluation>>;
export type _Ask = ExpectTrue<
  Extract<RealEvaluation["effect"], "ask"> extends "ask" ? true : false
>;
export type _Registration = ExpectTrue<Assignable<Registration, { dispose: () => Promise<void> }>>;

/* ------------------------------------------------------------------ */
/* 3. Chaque event consommé existe dans l'union v2 réelle, et son      */
/*    `data` réel est bien assignable à notre `data` local.            */
/*    C'est LE contrôle qui compte : c'est lui qui garantit qu'on ne    */
/*    lit pas un champ qui n'existe pas.                               */
/* ------------------------------------------------------------------ */

type RealEvent = ReturnType<Real["event"]["subscribe"]> extends AsyncIterable<infer E>
  ? E
  : never;

type R<T extends PluginEvent["type"]> = Extract<RealEvent, { type: T }>;
type L<T extends PluginEvent["type"]> = Extract<PluginEvent, { type: T }>;

export type _Idle = ExpectTrue<Assignable<R<"session.idle">, L<"session.idle">>>;
export type _ExecutionStarted = ExpectTrue<Assignable<R<"session.execution.started">, L<"session.execution.started">>>;
export type _ExecutionSucceeded = ExpectTrue<Assignable<R<"session.execution.succeeded">, L<"session.execution.succeeded">>>;
export type _StepStarted = ExpectTrue<Assignable<R<"session.step.started">, L<"session.step.started">>>;
export type _ToolCalled = ExpectTrue<Assignable<R<"session.tool.called">, L<"session.tool.called">>>;
export type _ExecutionFailed = ExpectTrue<Assignable<R<"session.execution.failed">, L<"session.execution.failed">>>;
export type _StepFailed = ExpectTrue<Assignable<R<"session.step.failed">, L<"session.step.failed">>>;
export type _PermissionAsked = ExpectTrue<Assignable<R<"permission.asked">, L<"permission.asked">>>;
export type _FormCreated = ExpectTrue<Assignable<R<"form.created">, L<"form.created">>>;
export type _FormReplied = ExpectTrue<Assignable<R<"form.replied">, L<"form.replied">>>;
export type _FormCancelled = ExpectTrue<Assignable<R<"form.cancelled">, L<"form.cancelled">>>;

/**
 * Notre `FormLike` est volontairement lâche ; ces quatre lignes garantissent
 * qu'il reste bien compatible ET que les champs sur lesquels on s'appuie
 * (`id` pour la dédup, `sessionID` pour l'activité, `title`/`fields` pour le
 * message) sont toujours là et des bons types dans l'API v2 réelle.
 */
type RealForm = Extract<RealEvent, { type: "form.created" }>["data"]["form"];

export type _FormId = ExpectTrue<Assignable<RealForm["id"], string>>;
export type _FormSessionID = ExpectTrue<Assignable<RealForm["sessionID"], string>>;
export type _FormTitle = ExpectTrue<Assignable<RealForm["title"], string>>;
export type _FormFields = ExpectTrue<Assignable<RealForm["fields"], readonly unknown[]>>;

/**
 * Le `subscribe` réel accepte bien l'argument que nous passons
 * (`{ signal }`) et produit un `AsyncIterable`.
 */
export type _Subscribe = ExpectTrue<
  Assignable<
    ReturnType<EventDomain["subscribe"]>,
    AsyncIterable<unknown>
  >
>;

/* ------------------------------------------------------------------ */
/* 4. Les editors tool/command v2 acceptent nos définitions réelles.    */
/*                                                                     */
/* Ce sont de VRAIS appels : l'`add` de v2 est générique sur le schéma */
/* d'entrée et sur l'output, donc seule l'inférence à l'appel peut      */
/* valider les contraintes. Si opencode durcit son schéma, ces lignes    */
/* cassent le typecheck.                                                */
/* ------------------------------------------------------------------ */

type RealToolEditor = Parameters<Parameters<Real["tool"]["transform"]>[0]>[0];
type RealCommandEditor = Parameters<Parameters<Real["command"]["transform"]>[0]>[0];

declare const cfg: NtfyConfig;
declare const realToolEditor: RealToolEditor;
declare const realCommandEditor: RealCommandEditor;

// Le plugin enregistre ses définitions via ces appels.
realToolEditor.add(createTestToolDefinition(cfg, "projet"));
realCommandEditor.add(createTestCommandDefinition(cfg, "projet"));

// Et l'éditeur local (type de `src/types.ts`) accepte les mêmes valeurs :
// c'est le contrat que `src/index.ts` utilise.
declare const localToolEditor: ToolEditor;
declare const localCommandEditor: CommandEditor;
localToolEditor.add(createTestToolDefinition(cfg, "projet"));
localCommandEditor.add(createTestCommandDefinition(cfg, "projet"));

/* ------------------------------------------------------------------ */
/* 5. Le default export a bien la forme attendue par le loader v2.     */
/* ------------------------------------------------------------------ */

type RealPlugin = Plugin.Plugin;
export type _Definition = ExpectTrue<
  Assignable<{ id: string; setup: RealPlugin["setup"] }, RealPlugin>
>;

/** Le retour de notre `setup` est un `Cleanup` (ou rien). */
export type _Cleanup = ExpectTrue<
  Assignable<Awaited<ReturnType<PluginDefinition["setup"]>>, Awaited<ReturnType<RealPlugin["setup"]>>>
>;
