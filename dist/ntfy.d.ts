import type { NtfyConfig } from "./config.js";
export interface NtfyPayload {
    readonly title: string;
    readonly message: string;
    readonly priority: number;
    readonly tags: readonly string[];
    readonly click?: string | undefined;
}
export declare function ntfyUrl(config: Pick<NtfyConfig, "server" | "topic">): string;
export declare function sendNtfy(config: NtfyConfig, payload: NtfyPayload): Promise<boolean>;
