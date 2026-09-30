// Tests de confidentialité : vérifie qu'aucune information du travail ne fuit
// en `minimal` / `summary`, et que `full` reste complet.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCompleted,
  formatError,
  formatPermission,
  formatQuestion,
  formatTest,
} from "../src/format.js";
import { resolveConfig } from "../src/config.js";

const SESSION = "Refonte du pipeline de paiement";
const ERROR_MSG = "ENOENT: /home/user/secret-project/.env introuvable";
const ERROR_TYPE = "provider.quota";
const RESOURCES = ["/home/user/secret-project/src/pay.ts"];
const QUESTION = "Quelle stratégie de retry veux-tu ?";

// Tout ce qui ne doit jamais sortir des notifications en modes non-`full`.
const SENSITIVE = [SESSION, "secret-project", "pay.ts", ".env", "ENOENT"];

const BUILDERS = {
  completed: (v: "minimal" | "summary" | "full") => formatCompleted("proj", v, SESSION),
  permission: (v: "minimal" | "summary" | "full") =>
    formatPermission("proj", v, "bash", RESOURCES, SESSION, "supprimer ?"),
  question: (v: "minimal" | "summary" | "full") =>
    formatQuestion("proj", v, QUESTION, 2, SESSION),
  error: (v: "minimal" | "summary" | "full") =>
    formatError("proj", v, ERROR_TYPE, ERROR_MSG, SESSION),
  test: (v: "minimal" | "summary" | "full") => formatTest("proj", v, "message arbitraire"),
};

for (const [name, build] of Object.entries(BUILDERS)) {
  test(`${name} : minimal ne fuit aucune information du travail`, () => {
    const text = JSON.stringify(build("minimal"));
    for (const secret of SENSITIVE) {
      assert.ok(!text.includes(secret), `minimal/${name} contient "${secret}"`);
    }
  });

  test(`${name} : summary ne fuit aucun contenu sensible`, () => {
    const text = JSON.stringify(build("summary"));
    for (const secret of SENSITIVE) {
      assert.ok(!text.includes(secret), `summary/${name} contient "${secret}"`);
    }
  });

  test(`${name} : full contient le détail`, () => {
    assert.ok(JSON.stringify(build("full")).length > JSON.stringify(build("minimal")).length);
  });
}

test("summary reste exploitable : type d'erreur et action conservés", () => {
  assert.ok(JSON.stringify(formatError("proj", "summary", ERROR_TYPE, ERROR_MSG, SESSION)).includes(ERROR_TYPE));
  assert.ok(JSON.stringify(formatPermission("proj", "summary", "bash", RESOURCES, SESSION)).includes("bash"));
});

test("verbosity : défaut minimal, valeur invalide : minimal", () => {
  assert.equal(resolveConfig({}).verbosity, "minimal");
  assert.equal(resolveConfig({ verbosity: "bidon" }).verbosity, "minimal");
  assert.equal(resolveConfig({ verbosity: 42 }).verbosity, "minimal");
  assert.equal(resolveConfig({ verbosity: " FULL " }).verbosity, "full");
  assert.equal(resolveConfig({ verbosity: "Summary" }).verbosity, "summary");
});
