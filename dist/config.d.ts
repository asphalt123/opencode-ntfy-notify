/**
 * Niveau de détail envoyé dans les notifications.
 *
 * Le serveur ntfy par défaut (`https://ntfy.sh`) est PUBLIC : le topic est
 * devinable et le contenu des messages est lisible par quiconque. Le défaut est
 * donc `minimal` — aucune information sur le travail de l'agent.
 *
 * - `minimal` : aucune info du travail (ni session, ni erreur, ni chemins).
 * - `summary` : la catégorie et le type d'erreur, jamais le contenu sensible.
 * - `full`    : tout (titre de session, message d'erreur, ressources).
 */
export type Verbosity = "minimal" | "summary" | "full";
export interface NtfyConfig {
    readonly server: string;
    readonly topic: string;
    readonly enabled: boolean;
    readonly priorityCompleted: number;
    readonly priorityPermission: number;
    readonly priorityError: number;
    readonly priorityQuestion: number;
    readonly notifyOnComplete: boolean;
    readonly notifyOnPermission: boolean;
    readonly notifyOnQuestion: boolean;
    readonly notifyOnError: boolean;
    readonly dedupeWindowMs: number;
    readonly verbosity: Verbosity;
    readonly token?: string | undefined;
    readonly click?: string | undefined;
    readonly quiet: boolean;
    readonly dryRun: boolean;
}
/** Forme générique des options reçues via ctx.options (PluginOptions). */
export type RawOptions = Readonly<Record<string, unknown>>;
export declare function resolveConfig(options?: RawOptions, env?: NodeJS.ProcessEnv): NtfyConfig;
/** Résumé journalisable de la config : ne contient jamais le token. */
export declare function summarizeConfig(config: NtfyConfig): string;
