/** Anti-doublons générique : clé stable + fenêtre TTL. */
export declare class Deduper {
    private readonly windowMs;
    private readonly seen;
    constructor(windowMs: number);
    /**
     * Retourne true si la clé a déjà été vue dans la fenêtre (doublon),
     * sinon l'enregistre et retourne false.
     */
    check(key: string, now?: number): boolean;
    get size(): number;
    private prune;
}
/**
 * Marque les sessions ayant réellement travaillé (execution/step/tool observés).
 * Évite de notifier "terminé" au démarrage ou sur une session vide.
 */
export declare class SessionActivity {
    private readonly active;
    mark(sessionID: string): void;
    has(sessionID: string): boolean;
    clear(sessionID: string): void;
}
/**
 * Mémorise les notifications déjà envoyées via le hook permission,
 * pour que l'event `permission.asked` de la même demande serve de secours
 * sans générer de doublon.
 */
export declare class PermissionHookTracker {
    private readonly lastBySession;
    noteHook(sessionID: string, now?: number): void;
    hasRecent(sessionID: string, windowMs: number, now?: number): boolean;
}
/** Clés de dédup stables : type + session (+ requestID pour les permissions). */
export declare function completeKey(sessionID: string): string;
export declare function permissionHookKey(sessionID: string, action: string, resources: readonly string[]): string;
export declare function permissionAskedKey(sessionID: string, requestID: string): string;
/**
 * Clé de dédup d'une question (`form.created`).
 * Le form est identifié par son `id` : un event rejoué (reconnexion du flux,
 * rejeu par le serveur) ne génère donc qu'une seule notification.
 */
export declare function questionKey(formID: string): string;
export declare function errorKey(sessionID: string): string;
