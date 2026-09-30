// Résolution de la configuration du plugin.
// Précédence : options opencode.json (ctx.options) > variables d'environnement > défauts.
// Le token n'est jamais journalisé (voir summarizeConfig).
const DEFAULT_SERVER = "https://ntfy.sh";
const DEFAULT_TOPIC = "opencode-notify";
const DEFAULT_DEDUPE_WINDOW_MS = 15_000;
const DEFAULT_VERBOSITY = "minimal";
/**
 * Résout la verbosité. Toute valeur inconnue retombe sur `minimal` (fail-safe :
 * une faute de frappe ne doit jamais faire basculer vers `full` et exposer le
 * contenu du travail sur un topic public).
 */
function asVerbosity(value) {
    if (typeof value !== "string")
        return DEFAULT_VERBOSITY;
    const normalized = value.trim().toLowerCase();
    if (normalized === "minimal" || normalized === "summary" || normalized === "full") {
        return normalized;
    }
    return DEFAULT_VERBOSITY;
}
function asNonEmptyString(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function asBool(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number" && (value === 0 || value === 1))
        return value === 1;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "y", "on"].includes(normalized))
            return true;
        if (["false", "0", "no", "n", "off"].includes(normalized))
            return false;
    }
    return undefined;
}
function asInt(value) {
    if (typeof value === "number" && Number.isInteger(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value.trim());
        if (Number.isInteger(parsed))
            return parsed;
    }
    return undefined;
}
function clampPriority(value, fallback) {
    const parsed = asInt(value);
    if (parsed === undefined)
        return fallback;
    if (parsed < 1)
        return 1;
    if (parsed > 5)
        return 5;
    return parsed;
}
export function resolveConfig(options = {}, env = process.env) {
    const opt = (key) => options[key];
    const dedupeRaw = asInt(opt("dedupeWindowMs"));
    const dedupeWindowMs = dedupeRaw === undefined || dedupeRaw < 0 ? DEFAULT_DEDUPE_WINDOW_MS : dedupeRaw;
    return {
        server: asNonEmptyString(opt("server")) ??
            asNonEmptyString(env["OPENCODE_NTFY_SERVER"]) ??
            DEFAULT_SERVER,
        topic: asNonEmptyString(opt("topic")) ??
            asNonEmptyString(env["OPENCODE_NTFY_TOPIC"]) ??
            DEFAULT_TOPIC,
        enabled: asBool(opt("enabled")) ?? asBool(env["OPENCODE_NTFY_ENABLED"]) ?? true,
        priorityCompleted: clampPriority(opt("priorityCompleted"), 3),
        priorityPermission: clampPriority(opt("priorityPermission"), 4),
        priorityError: clampPriority(opt("priorityError"), 5),
        priorityQuestion: clampPriority(opt("priorityQuestion"), 4),
        notifyOnComplete: asBool(opt("notifyOnComplete")) ?? true,
        notifyOnPermission: asBool(opt("notifyOnPermission")) ?? true,
        // Comme les autres `notifyOn*`, lue uniquement via `ctx.options`
        // (pas de variable d'env : on reste cohérent avec l'existant).
        notifyOnQuestion: asBool(opt("notifyOnQuestion")) ?? true,
        notifyOnError: asBool(opt("notifyOnError")) ?? true,
        dedupeWindowMs,
        verbosity: asVerbosity(opt("verbosity")),
        token: asNonEmptyString(opt("token")) ?? asNonEmptyString(env["OPENCODE_NTFY_TOKEN"]),
        click: asNonEmptyString(opt("click")),
        quiet: asBool(opt("quiet")) ?? false,
        dryRun: asBool(opt("dryRun")) ?? asBool(env["OPENCODE_NTFY_DRY_RUN"]) ?? false,
    };
}
/** Résumé journalisable de la config : ne contient jamais le token. */
export function summarizeConfig(config) {
    return (`server=${config.server} topic=${config.topic} ` +
        `enabled=${config.enabled} quiet=${config.quiet} dryRun=${config.dryRun} ` +
        `priorities=${config.priorityCompleted}/${config.priorityPermission}/${config.priorityError}/${config.priorityQuestion} ` +
        `onComplete=${config.notifyOnComplete} onPermission=${config.notifyOnPermission} ` +
        `onQuestion=${config.notifyOnQuestion} onError=${config.notifyOnError} ` +
        `verbosity=${config.verbosity} ` +
        `dedupeWindowMs=${config.dedupeWindowMs} ` +
        `token=${config.token !== undefined ? "set" : "unset"} click=${config.click ?? "unset"}`);
}
