// Tests du 4e déclencheur : event `form.created` (l'agent pose une question).
//
// Aucun opencode n'est lancé : on joue un faux contexte + un faux serveur ntfy
// (voir `harness.ts`) et on compte les notifications reçues.

import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { onlyOne, startPlugin, type PluginHarness } from "./harness.js";
import type { FormLike, PluginEvent } from "../src/types.js";

const SESSION = "ses_1";

function formCreated(form: FormLike): PluginEvent {
  return { type: "form.created", data: { form } };
}

/** Formulaire complet et réaliste (forme d'un `FormInfo1` v2). */
const VALID_FORM: FormLike = {
  id: "form_abc",
  sessionID: SESSION,
  title: "Quel provider utiliser pour la migration ?",
  fields: [
    { key: "provider", type: "string", title: "Provider" },
    { key: "confirmed", type: "boolean", title: "Confirmer" },
  ],
  metadata: {},
};

describe("form.created — notifier une question de l'agent", () => {
  const running: PluginHarness[] = [];
  after(async () => {
    for (const harness of running) await harness.stop();
  });

  /**
   * `verbosity: "full"` par défaut dans cette suite : les tests vérifient le
   * contenu des messages (titre du formulaire, nombre de champs, session), ce
   * qui n'est composé qu'en niveau `full`. Le comportement en `minimal` est
   * couvert par un test dédié, pour que la suite reste valable quel que soit
   * le niveau de détail configuré.
   */
  async function boot(options?: Record<string, unknown>): Promise<PluginHarness> {
    const harness = await startPlugin({
      options: { verbosity: "full", ...options },
      sessionTitles: { [SESSION]: "Refonte du module auth" },
    });
    running.push(harness);
    return harness;
  }

  test("un form.created produit exactement 1 notification « question »", async () => {
    const harness = await boot();

    await harness.emit(formCreated(VALID_FORM));

    const notification = onlyOne(harness.sent);
    assert.equal(notification.topic, "test-topic");
    assert.equal(notification.title, "[mon-projet] Question de l'agent");
    assert.equal(notification.priority, 4, "priorité 4, comme la permission");
    assert.deepEqual(notification.tags, ["speech_balloon"]);
    assert.match(notification.message, /Quel provider utiliser pour la migration \?/);
    assert.match(notification.message, /2 champs/);
    assert.match(notification.message, /session « Refonte du module auth »/);
  });

  test("le même form.created rejoué 2x ne notifie qu'une fois (dédup)", async () => {
    const harness = await boot();

    await harness.emit(formCreated(VALID_FORM));
    await harness.emit(formCreated(VALID_FORM)); // rejeux (reconnexion du flux)
    await harness.emit(formCreated(VALID_FORM));

    onlyOne(harness.sent);
  });

  test("deux forms différents notifient deux fois", async () => {
    const harness = await boot();

    await harness.emit(formCreated(VALID_FORM));
    await harness.emit(formCreated({ ...VALID_FORM, id: "form_def", title: "Autre question ?" }));

    assert.equal(harness.sent.length, 2);
  });

  test("form.created puis form.replied / form.cancelled : toujours 1 seule notif", async () => {
    const harness = await boot();

    await harness.emit(formCreated(VALID_FORM));
    await harness.emit({ type: "form.replied", data: { id: "form_abc", sessionID: SESSION } });
    await harness.emit({ type: "form.cancelled", data: { id: "form_abc", sessionID: SESSION } });

    onlyOne(harness.sent);
  });

  test("un form.replied seul ne notifie rien", async () => {
    const harness = await boot();

    await harness.emit({ type: "form.replied", data: { id: "form_xyz", sessionID: SESSION } });
    await harness.emit({ type: "form.cancelled", data: { id: "form_xyz", sessionID: SESSION } });

    assert.equal(harness.sent.length, 0);
  });

  test("notifyOnQuestion=false : aucune notification de question", async () => {
    const harness = await boot({ notifyOnQuestion: false });

    await harness.emit(formCreated(VALID_FORM));

    assert.equal(harness.sent.length, 0);
  });

  test("le déclencheur est bien branché quel que soit le niveau de détail", async () => {
    // `minimal` est le défaut : le message est générique, mais la notification
    // part bien (une seule fois, à la bonne priorité) et sans le contenu du
    // formulaire.
    const harness = await boot({ verbosity: "minimal" });

    await harness.emit(formCreated(VALID_FORM));
    await harness.emit(formCreated(VALID_FORM)); // dedup inchangé

    const notification = onlyOne(harness.sent);
    assert.equal(notification.priority, 4);
    assert.doesNotMatch(notification.message, /Quel provider utiliser/);
  });

  test("le titre est nettoyé : une seule ligne, sans caractères de contrôle", async () => {
    const harness = await boot();

    await harness.emit(
      formCreated({
        ...VALID_FORM,
        title: "**Choix** :\n- a\n- b\u0007  ",
      }),
    );

    const notification = onlyOne(harness.sent);
    assert.doesNotMatch(notification.message, /[\n\r]/, "pas de retour à la ligne");
    // Contrôle explicite : pas seulement les newlines, tous les caractères de contrôle.
    assert.equal(
      /[\u0000-\u001F]/.test(notification.message),
      false,
      "aucun caractère de contrôle C0",
    );
    assert.match(notification.message, /\*\*Choix\*\* : - a - b/);
  });

  test("titre absent : notification au message dégradé, aucun throw", async () => {
    const harness = await boot();

    await harness.emit(formCreated({ id: "form_sans_titre", sessionID: SESSION }));

    const notification = onlyOne(harness.sent);
    assert.equal(notification.title, "[mon-projet] Question de l'agent");
    assert.match(notification.message, /formulaire sans titre/);
  });

  test("payload malformé (fields non tableau, form absent) : aucun throw, plugin vivant", async () => {
    const harness = await boot();

    // `fields` n'est pas un tableau : lu via Array.isArray, jamais cru.
    await harness.emit(
      formCreated({ id: "form_bad", sessionID: SESSION, title: "Q ?", fields: "nope" as never }),
    );
    // `form` absent : event inexploitable -> on ignore, on ne notifie pas.
    await harness.emit({ type: "form.created", data: {} });
    // `form` pas un objet du tout, `sessionID` et `id` absents.
    await harness.emit({ type: "form.created", data: { form: "pas un objet" as never } });

    assert.equal(harness.sent.length, 1, "seul le form malformé mais exploitable a notifié");

    // Le plugin est toujours vivant : un form valide passe juste après.
    await harness.emit(formCreated({ ...VALID_FORM, id: "form_apres" }));
    assert.equal(harness.sent.length, 2);
  });

  test("le form marque l'activité : session.idle après la question notifie « terminé »", async () => {
    const harness = await boot();

    await harness.emit(formCreated(VALID_FORM));
    await harness.emit({ type: "session.idle", data: { sessionID: SESSION } });

    assert.deepEqual(
      harness.sent.map((n) => n.title),
      ["[mon-projet] Question de l'agent", "[mon-projet] Tâche terminée"],
      "la question ne doit pas swallow la notification de fin",
    );
  });

  test("notifyOnQuestion=false : l'activité reste marquée, « terminé » part quand même", async () => {
    const harness = await boot({ notifyOnQuestion: false });

    await harness.emit(formCreated(VALID_FORM));
    await harness.emit({ type: "session.idle", data: { sessionID: SESSION } });

    assert.deepEqual(
      harness.sent.map((n) => n.title),
      ["[mon-projet] Tâche terminée"],
    );
  });

  test("les 3 déclencheurs existants ne sont pas perturbés", async () => {
    const harness = await boot();

    await harness.emit({ type: "session.step.started", data: { sessionID: SESSION } });
    await harness.emit({ type: "session.idle", data: { sessionID: SESSION } });
    await harness.evaluatePermission({
      sessionID: SESSION,
      action: "bash",
      resources: ["rm -rf build"],
      effect: "ask",
    });
    await harness.emit({
      type: "session.step.failed",
      data: { sessionID: SESSION, error: { type: "internal", message: "boom" } },
    });
    await harness.emit({ type: "session.tool.called", data: { sessionID: SESSION } });
    await harness.emit({ type: "session.idle", data: { sessionID: SESSION } });

    // Le 2e « terminé » est absent : la dédup (fenêtre 15 s) l'a absorbé,
    // comportement préexistant, pas une régression du nouveau déclencheur.
    assert.deepEqual(
      harness.sent.map((n) => n.title),
      [
        "[mon-projet] Tâche terminée",
        "[mon-projet] Permission requise",
        "[mon-projet] Erreur bloquante",
      ],
    );
  });
});
