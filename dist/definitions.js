// Définitions du tool custom et de la commande slash.
//
// Isolées dans leur propre module pour deux raisons :
//  1. `setup()` reste lisible ;
//  2. `typecheck/conformance.ts` peut les importer et vérifier que ces
//     LITTERAUX réels sont acceptés par l'API opencode v2 (l'`add` de v2 est
//     générique sur le schéma d'entrée : seule la valeur concrète permet de
//     valider les contraintes).
//
// ⚠️ Pas d'annotation de type de retour ici : elle élargirait le littéral au
// type local permissif (`input: Readonly<Record<string, unknown>>`), que
// l'`add` générique de v2 refuse (il exige un vrai schéma JSON).
// Le contrat local est vérifié à l'appel `editor.add(...)` dans `index.ts`,
// le contrat v2 réel dans `typecheck/conformance.ts`.
import { sendNtfy } from "./ntfy.js";
import { formatTest } from "./format.js";
/** Tool `ntfy_notify_test` : envoie une notification de test (debug). */
export function createTestToolDefinition(config, project) {
    return {
        name: "ntfy_notify_test",
        description: "Envoie une notification ntfy de test (debug du plugin ntfy-notify).",
        input: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Message de la notification de test.",
                },
            },
            required: ["message"],
            additionalProperties: false,
        },
        execute: async (input) => {
            const record = typeof input === "object" && input !== null ? input : {};
            const message = typeof record["message"] === "string" && record["message"].trim() !== ""
                ? record["message"]
                : "Test ntfy-notify";
            await sendNtfy(config, {
                ...formatTest(project, config.verbosity, message),
                priority: config.priorityCompleted,
            });
            return { content: `Notification de test envoyée vers ${config.server}/${config.topic}.` };
        },
    };
}
/** Commande `/ntfy-test` : notification de test déclenchée manuellement. */
export function createTestCommandDefinition(config, project) {
    return {
        name: "ntfy-test",
        description: "Envoie une notification ntfy de test (debug du plugin ntfy-notify).",
        execute: async () => {
            await sendNtfy(config, {
                ...formatTest(project, config.verbosity, "Test manuel depuis /ntfy-test"),
                priority: config.priorityCompleted,
            });
        },
    };
}
