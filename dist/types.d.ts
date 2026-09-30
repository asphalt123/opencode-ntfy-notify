/** `ctx.app` : identité de l'instance opencode qui charge le plugin. */
export interface AppInfo {
    readonly name: string;
    readonly version: string;
    readonly channel: string;
}
/** `ctx.location.project` : projet courante. */
export interface ProjectInfo {
    readonly id: string;
    readonly directory: string;
    readonly canonical: string;
}
/** `ctx.location` : répertoire de travail et projet. */
export interface LocationInfo {
    readonly directory: string;
    readonly workspaceID?: string | undefined;
    readonly project: ProjectInfo;
}
/** `ctx.options` : options du plugin, non typées par opencode. */
export type PluginOptions = Readonly<Record<string, unknown>>;
/** Effet d'une évaluation de permission (v2 : "allow" | "deny" | "ask"). */
export type PermissionEffect = "allow" | "ask" | "deny";
/** Événement `PermissionEvaluation` reçu par le hook "evaluate". */
export interface PermissionEvaluation {
    readonly sessionID: string;
    readonly agent?: string | undefined;
    readonly action: string;
    readonly resources: readonly string[];
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
    readonly effect: PermissionEffect;
    readonly message?: string | undefined;
}
/** Objet renvoyé par `hook()` / `transform()` : permet de se désabonner. */
export interface Registration {
    readonly dispose: () => Promise<void>;
}
/** `ctx.permission` : seul `hook` est utilisé. */
export interface PermissionDomain {
    hook(name: "evaluate", callback: (event: PermissionEvaluation) => Promise<void> | void): Promise<Registration>;
}
export interface SessionEventData {
    readonly sessionID: string;
}
export interface SessionErrorData {
    readonly type: string;
    readonly message: string;
    readonly status?: number | undefined;
}
export interface SessionFailureData extends SessionEventData {
    readonly error: SessionErrorData;
}
export interface PermissionAskedData extends SessionEventData {
    readonly id: string;
    readonly action: string;
    readonly resources: readonly string[];
    readonly message?: string | undefined;
}
/**
 * Sous-ensemble **volontairement lâche** de `FormInfo1` (event `form.created`).
 *
 * Pourquoi lâche : la forme d'un champ de formulaire dépend du provider
 * (`FormStringField1 | FormNumberField1 | … | FormExternalField1`) et peut
 * évoluer. On ne lit donc que `id`, `sessionID`, `title` et `fields`, et
 * toujours via des vérifications à l'exécution (`typeof` / `Array.isArray`).
 * Tout est optionnel : mieux vaut une notification au message dégradé qu'un
 * `throw` si la payload réelle s'écarte de la forme déclarée.
 */
export interface FormLike {
    readonly id?: string | undefined;
    readonly sessionID?: string | undefined;
    readonly title?: string | undefined;
    readonly fields?: readonly unknown[] | undefined;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}
/** `form.created` : le formulaire est sous `data.form` (pas de sessionID racine). */
export interface FormCreatedData {
    readonly form?: FormLike | undefined;
}
/** `form.replied` / `form.cancelled` : reconnus pour être explicitement ignorés. */
export interface FormResolvedData {
    readonly id?: string | undefined;
    readonly sessionID?: string | undefined;
}
/**
 * Sous-ensemble des events v2 consommés par le plugin.
 * Un membre par `type` (et non un `type` unionné) : sans cela
 * `Extract<PluginEvent, { type: "…" }>` renvoie `never` et le contrôle de
 * conformité perdrait tout son sens.
 * Les events ignorés tombent dans le `default` du switch.
 */
export type PluginEvent = {
    readonly type: "session.idle";
    readonly data: SessionEventData;
} | {
    readonly type: "session.execution.started";
    readonly data: SessionEventData;
} | {
    readonly type: "session.execution.succeeded";
    readonly data: SessionEventData;
} | {
    readonly type: "session.step.started";
    readonly data: SessionEventData;
} | {
    readonly type: "session.tool.called";
    readonly data: SessionEventData;
} | {
    readonly type: "session.execution.failed";
    readonly data: SessionFailureData;
} | {
    readonly type: "session.step.failed";
    readonly data: SessionFailureData;
} | {
    readonly type: "permission.asked";
    readonly data: PermissionAskedData;
} | {
    readonly type: "form.created";
    readonly data: FormCreatedData;
} | {
    readonly type: "form.replied";
    readonly data: FormResolvedData;
} | {
    readonly type: "form.cancelled";
    readonly data: FormResolvedData;
};
/** `ctx.event` : flux d'événements de la session courante. */
export interface EventDomain {
    subscribe(options?: {
        readonly signal?: AbortSignal | undefined;
    }): AsyncIterable<PluginEvent>;
}
/** `ctx.session.get()` : seule la partie utile est typée. */
export interface SessionSummary {
    readonly title?: string | undefined;
}
/** `ctx.session` : seule `get` est utilisée. */
export interface SessionDomain {
    get(input: {
        readonly sessionID: string;
    }): Promise<SessionSummary>;
}
/** Schéma JSON d'entrée d'un tool custom (sous-ensemble de ce qu'accepte v2). */
export type ToolInputSchema = Readonly<Record<string, unknown>>;
/** Résultat renvoyé par l'`execute` d'un tool custom. */
export interface ToolResult {
    readonly content?: string | undefined;
}
/** Définition d'un tool custom ajoutée via `ctx.tool.transform`. */
export interface ToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly input: ToolInputSchema;
    execute(input: unknown, context: unknown): Promise<ToolResult>;
}
/** `ctx.tool` : seul `transform` est utilisé. */
export interface ToolDomain {
    transform(callback: (editor: ToolEditor) => void): Promise<Registration>;
}
/** `ctx.tool.transform(editor => …)`. */
export interface ToolEditor {
    add(definition: ToolDefinition): void;
}
/** Définition d'une commande slash ajoutée via `ctx.command.transform`. */
export interface CommandDefinition {
    readonly name: string;
    readonly description?: string | undefined;
    execute(input: unknown): Promise<void>;
}
/** `ctx.command.transform(editor => …)`. */
export interface CommandEditor {
    add(definition: CommandDefinition): void;
}
/** `ctx.command` : seul `transform` est utilisé. */
export interface CommandDomain {
    transform(callback: (editor: CommandEditor) => void): Promise<Registration>;
}
/**
 * Contexte v2 minimal : uniquement les domaines consommés par ce plugin.
 * Le vrai `ctx` d'opencode v2 est structurellement compatible (vérifié par
 * `typecheck/conformance.ts`).
 */
export interface PluginContext {
    readonly app: AppInfo;
    readonly location: LocationInfo;
    readonly options: PluginOptions;
    readonly permission: PermissionDomain;
    readonly event: EventDomain;
    readonly session: SessionDomain;
    readonly tool: ToolDomain;
    readonly command: CommandDomain;
}
/** Retour de `setup()` : nettoyage appelé à l'arrêt du plugin. */
export type Cleanup = () => Promise<void> | void;
/**
 * Forme du default export attendue par le loader de plugins v2.
 * Identique à ce que retourne `Plugin.define()`, qui est un simple
 * `identity` — l'appeler imposerait un import runtime de `@opencode/plugin`.
 */
export interface PluginDefinition {
    readonly id: string;
    readonly setup: (context: PluginContext) => Promise<Cleanup | void> | Cleanup | void;
}
