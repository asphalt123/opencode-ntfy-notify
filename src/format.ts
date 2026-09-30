// Construction des titres/messages de notification.
//
// TOUT le filtrage de confidentialité passe par ce fichier : c'est le seul
// endroit autorisé à composer un titre ou un message. Le niveau de détail est
// un paramètre (`verbosity`), jamais une décision prise à l'appel — sinon un
// jour un nouveau déclencheur oublierait le filtre et balancerait un message
// d'erreur sur un topic public.
//
// Rappel : le serveur ntfy par défaut (`https://ntfy.sh`) est public, le topic
// est devinable et les messages sont lisibles par quiconque. D'où `minimal` par
// défaut.

import { basename } from "node:path";
import type { Verbosity } from "./config.js";
import type { LocationInfo } from "./types.js";

export interface NtfyContent {
  readonly title: string;
  readonly message: string;
  readonly tags: readonly string[];
}

const RESOURCES_PREVIEW_MAX = 200;
const ERROR_PREVIEW_MAX = 300;
const QUESTION_TITLE_MAX = 200;
const ERROR_TYPE_MAX = 80;

/** Caractères de contrôle C0/C1 : invisibles, et destructeurs pour le rendu ntfy. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** Nom court du projet : basename de project.canonical, repli sur directory. */
export function projectName(location: LocationInfo): string {
  const canonical = location.project.canonical.trim();
  const base = canonical !== "" ? canonical : location.directory;
  const name = basename(base.replace(/\/+$/, "") || base);
  return name !== "" ? name : base;
}

/**
 * Ramène un texte sur une seule ligne : caractères de contrôle remplacés par
 * une espace, suites d'espaces/newlines réduites, puis troncature.
 * Indispensable pour un titre de formulaire, qui peut contenir du markdown
 * ou des retours à la ligne.
 */
export function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Le titre de session est une information sur le travail : `full` uniquement. */
function sessionSuffix(verbosity: Verbosity, sessionTitle?: string): string {
  if (verbosity !== "full") return "";
  if (sessionTitle === undefined || sessionTitle.trim() === "") return "";
  return ` (session « ${truncate(sessionTitle, 80)} »)`;
}

export function formatCompleted(
  project: string,
  verbosity: Verbosity,
  sessionTitle?: string,
): NtfyContent {
  if (verbosity === "minimal") {
    return {
      title: `[${project}] OpenCode`,
      message: "L'agent a terminé sa tâche.",
      tags: ["white_check_mark"],
    };
  }
  const where = sessionSuffix(verbosity, sessionTitle);
  if (verbosity === "summary") {
    return {
      title: `[${project}] Tâche terminée`,
      message: "L'agent a terminé sa tâche.",
      tags: ["white_check_mark"],
    };
  }
  const subject = where !== "" ? where : "session";
  return {
    title: `[${project}] Tâche terminée`,
    message: `${subject} : tâche terminée dans ${project}, à toi de jouer.`,
    tags: ["white_check_mark"],
  };
}

export function formatPermission(
  project: string,
  verbosity: Verbosity,
  action: string,
  resources: readonly string[],
  sessionTitle?: string,
  detail?: string,
): NtfyContent {
  if (verbosity === "minimal") {
    return {
      title: `[${project}] OpenCode`,
      message: "L'agent attend une réponse de ta part.",
      tags: ["lock"],
    };
  }
  // Le nom de l'action (`bash`, `edit`…) ne révèle pas le contenu du travail ;
  // les ressources, elles, contiennent des chemins de fichiers.
  const where = sessionSuffix(verbosity, sessionTitle);
  if (verbosity === "summary") {
    return {
      title: `[${project}] Permission requise`,
      message: `L'agent attend une réponse pour une action « ${truncate(action, 40)} ».`,
      tags: ["lock"],
    };
  }
  const preview =
    resources.length > 0 ? truncate(resources.join(", "), RESOURCES_PREVIEW_MAX) : "—";
  const extra =
    detail !== undefined && detail.trim() !== "" ? ` — ${truncate(detail, 120)}` : "";
  return {
    title: `[${project}] Permission requise`,
    message: `L'agent attend une réponse${where} : ${action} ${preview}${extra}`,
    tags: ["lock"],
  };
}

/**
 * Notification « l'agent pose une question » (event `form.created`).
 * Le titre du formulaire contient le plus souvent la question elle-même :
 * c'est du contenu de travail, donc `full` uniquement.
 */
export function formatQuestion(
  project: string,
  verbosity: Verbosity,
  formTitle: string | undefined,
  fieldCount: number | undefined,
  sessionTitle?: string,
): NtfyContent {
  if (verbosity === "minimal") {
    return {
      title: `[${project}] OpenCode`,
      message: "L'agent te pose une question.",
      tags: ["speech_balloon"],
    };
  }
  const fields =
    fieldCount !== undefined && fieldCount > 0
      ? ` — ${fieldCount} champ${fieldCount > 1 ? "s" : ""}`
      : "";
  if (verbosity === "summary") {
    return {
      title: `[${project}] Question de l'agent`,
      message: `L'agent attend ta réponse à un formulaire${fields}.`,
      tags: ["speech_balloon"],
    };
  }
  const where = sessionSuffix(verbosity, sessionTitle);
  const subject = truncate(formTitle ?? "", QUESTION_TITLE_MAX);
  return {
    title: `[${project}] Question de l'agent`,
    message: `L'agent attend votre réponse${where} : ${
      subject !== "" ? subject : "formulaire sans titre"
    }${fields}`,
    tags: ["speech_balloon"],
  };
}

export function formatError(
  project: string,
  verbosity: Verbosity,
  errorType: string,
  errorMessage: string,
  sessionTitle?: string,
): NtfyContent {
  if (verbosity === "minimal") {
    return {
      title: `[${project}] OpenCode`,
      message: "L'agent a rencontré une erreur.",
      tags: ["rotating_light"],
    };
  }
  const where = sessionSuffix(verbosity, sessionTitle);
  if (verbosity === "summary") {
    // Le type d'erreur (`provider.quota`, `tool.execution`…) est un diagnostic
    // utile, pas une fuite : pas de message, pas de chemin, pas de session.
    return {
      title: `[${project}] Erreur bloquante`,
      message: `Échec de type « ${truncate(errorType, ERROR_TYPE_MAX)} ».`,
      tags: ["rotating_light"],
    };
  }
  return {
    title: `[${project}] Erreur bloquante`,
    message: `Échec${where} : ${truncate(`${errorType}: ${errorMessage}`, ERROR_PREVIEW_MAX)}`,
    tags: ["rotating_light"],
  };
}

export function formatTest(
  project: string,
  verbosity: Verbosity,
  message: string,
): NtfyContent {
  if (verbosity !== "full") {
    return {
      title: `[${project}] OpenCode`,
      message: "Notification de test.",
      tags: ["bell"],
    };
  }
  return {
    title: `[${project}] Notification de test`,
    message: truncate(message, 300),
    tags: ["bell"],
  };
}
