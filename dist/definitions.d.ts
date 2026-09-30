import type { NtfyConfig } from "./config.js";
/** Tool `ntfy_notify_test` : envoie une notification de test (debug). */
export declare function createTestToolDefinition(config: NtfyConfig, project: string): {
    name: string;
    description: string;
    input: {
        type: string;
        properties: {
            message: {
                type: string;
                description: string;
            };
        };
        required: string[];
        additionalProperties: boolean;
    };
    execute: (input: unknown) => Promise<{
        content: string;
    }>;
};
/** Commande `/ntfy-test` : notification de test déclenchée manuellement. */
export declare function createTestCommandDefinition(config: NtfyConfig, project: string): {
    name: string;
    description: string;
    execute: () => Promise<void>;
};
