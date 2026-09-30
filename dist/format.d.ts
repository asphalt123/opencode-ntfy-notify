import type { Verbosity } from "./config.js";
import type { LocationInfo } from "./types.js";
export interface NtfyContent {
    readonly title: string;
    readonly message: string;
    readonly tags: readonly string[];
}
/** Nom court du projet : basename de project.canonical, repli sur directory. */
export declare function projectName(location: LocationInfo): string;
/**
 * Ramène un texte sur une seule ligne : caractères de contrôle remplacés par
 * une espace, suites d'espaces/newlines réduites, puis troncature.
 * Indispensable pour un titre de formulaire, qui peut contenir du markdown
 * ou des retours à la ligne.
 */
export declare function truncate(text: string, maxLength: number): string;
export declare function formatCompleted(project: string, verbosity: Verbosity, sessionTitle?: string): NtfyContent;
export declare function formatPermission(project: string, verbosity: Verbosity, action: string, resources: readonly string[], sessionTitle?: string, detail?: string): NtfyContent;
/**
 * Notification « l'agent pose une question » (event `form.created`).
 * Le titre du formulaire contient le plus souvent la question elle-même :
 * c'est du contenu de travail, donc `full` uniquement.
 */
export declare function formatQuestion(project: string, verbosity: Verbosity, formTitle: string | undefined, fieldCount: number | undefined, sessionTitle?: string): NtfyContent;
export declare function formatError(project: string, verbosity: Verbosity, errorType: string, errorMessage: string, sessionTitle?: string): NtfyContent;
export declare function formatTest(project: string, verbosity: Verbosity, message: string): NtfyContent;
