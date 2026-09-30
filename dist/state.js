// Déduplication en mémoire avec TTL + suivi d'activité par session.
// Tout est volatil (pas de ctx.storage) : un redémarrage d'opencode repart propre.
/** Anti-doublons générique : clé stable + fenêtre TTL. */
export class Deduper {
    windowMs;
    seen = new Map();
    constructor(windowMs) {
        this.windowMs = windowMs;
    }
    /**
     * Retourne true si la clé a déjà été vue dans la fenêtre (doublon),
     * sinon l'enregistre et retourne false.
     */
    check(key, now = Date.now()) {
        this.prune(now);
        const previous = this.seen.get(key);
        if (previous !== undefined && now - previous < this.windowMs)
            return true;
        this.seen.set(key, now);
        return false;
    }
    get size() {
        return this.seen.size;
    }
    prune(now) {
        if (this.windowMs <= 0) {
            this.seen.clear();
            return;
        }
        for (const [key, at] of this.seen) {
            if (now - at >= this.windowMs)
                this.seen.delete(key);
        }
    }
}
/**
 * Marque les sessions ayant réellement travaillé (execution/step/tool observés).
 * Évite de notifier "terminé" au démarrage ou sur une session vide.
 */
export class SessionActivity {
    active = new Set();
    mark(sessionID) {
        this.active.add(sessionID);
    }
    has(sessionID) {
        return this.active.has(sessionID);
    }
    clear(sessionID) {
        this.active.delete(sessionID);
    }
}
/**
 * Mémorise les notifications déjà envoyées via le hook permission,
 * pour que l'event `permission.asked` de la même demande serve de secours
 * sans générer de doublon.
 */
export class PermissionHookTracker {
    lastBySession = new Map();
    noteHook(sessionID, now = Date.now()) {
        this.lastBySession.set(sessionID, now);
    }
    hasRecent(sessionID, windowMs, now = Date.now()) {
        const at = this.lastBySession.get(sessionID);
        if (at === undefined)
            return false;
        if (now - at >= windowMs) {
            this.lastBySession.delete(sessionID);
            return false;
        }
        return true;
    }
}
/** Clés de dédup stables : type + session (+ requestID pour les permissions). */
export function completeKey(sessionID) {
    return `complete:${sessionID}`;
}
export function permissionHookKey(sessionID, action, resources) {
    return `permission:${sessionID}:hook:${action}:${resources.join(",")}`;
}
export function permissionAskedKey(sessionID, requestID) {
    return `permission:${sessionID}:${requestID}`;
}
/**
 * Clé de dédup d'une question (`form.created`).
 * Le form est identifié par son `id` : un event rejoué (reconnexion du flux,
 * rejeu par le serveur) ne génère donc qu'une seule notification.
 */
export function questionKey(formID) {
    return `question:${formID}`;
}
export function errorKey(sessionID) {
    return `error:${sessionID}`;
}
