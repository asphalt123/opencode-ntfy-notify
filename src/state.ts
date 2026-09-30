// Déduplication en mémoire avec TTL + suivi d'activité par session.
// Tout est volatil (pas de ctx.storage) : un redémarrage d'opencode repart propre.

/** Anti-doublons générique : clé stable + fenêtre TTL. */
export class Deduper {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  /**
   * Retourne true si la clé a déjà été vue dans la fenêtre (doublon),
   * sinon l'enregistre et retourne false.
   */
  check(key: string, now: number = Date.now()): boolean {
    this.prune(now);
    const previous = this.seen.get(key);
    if (previous !== undefined && now - previous < this.windowMs) return true;
    this.seen.set(key, now);
    return false;
  }

  get size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    if (this.windowMs <= 0) {
      this.seen.clear();
      return;
    }
    for (const [key, at] of this.seen) {
      if (now - at >= this.windowMs) this.seen.delete(key);
    }
  }
}

/**
 * Marque les sessions ayant réellement travaillé (execution/step/tool observés).
 * Évite de notifier "terminé" au démarrage ou sur une session vide.
 */
export class SessionActivity {
  private readonly active = new Set<string>();

  mark(sessionID: string): void {
    this.active.add(sessionID);
  }

  has(sessionID: string): boolean {
    return this.active.has(sessionID);
  }

  clear(sessionID: string): void {
    this.active.delete(sessionID);
  }
}

/**
 * Mémorise les notifications déjà envoyées via le hook permission,
 * pour que l'event `permission.asked` de la même demande serve de secours
 * sans générer de doublon.
 */
export class PermissionHookTracker {
  private readonly lastBySession = new Map<string, number>();

  noteHook(sessionID: string, now: number = Date.now()): void {
    this.lastBySession.set(sessionID, now);
  }

  hasRecent(sessionID: string, windowMs: number, now: number = Date.now()): boolean {
    const at = this.lastBySession.get(sessionID);
    if (at === undefined) return false;
    if (now - at >= windowMs) {
      this.lastBySession.delete(sessionID);
      return false;
    }
    return true;
  }
}

/** Clés de dédup stables : type + session (+ requestID pour les permissions). */
export function completeKey(sessionID: string): string {
  return `complete:${sessionID}`;
}

export function permissionHookKey(
  sessionID: string,
  action: string,
  resources: readonly string[],
): string {
  return `permission:${sessionID}:hook:${action}:${resources.join(",")}`;
}

export function permissionAskedKey(sessionID: string, requestID: string): string {
  return `permission:${sessionID}:${requestID}`;
}

/**
 * Clé de dédup d'une question (`form.created`).
 * Le form est identifié par son `id` : un event rejoué (reconnexion du flux,
 * rejeu par le serveur) ne génère donc qu'une seule notification.
 */
export function questionKey(formID: string): string {
  return `question:${formID}`;
}

export function errorKey(sessionID: string): string {
  return `error:${sessionID}`;
}
