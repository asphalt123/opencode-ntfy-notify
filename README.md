# opencode-ntfy-notify

Get an [ntfy](https://ntfy.sh) push notification when an OpenCode session needs you —
when the agent finishes a task, asks for a permission, poses a question, or hits a
blocking error.

Written for the **OpenCode v2** plugin API.

[English](#english) · [Français](#français)

---

## English

### What it notifies you about

| Situation | Trigger | Priority | Tag |
|---|---|---|---|
| Task finished | `session.execution.succeeded` | 3 | `white_check_mark` |
| Permission requested | `permission.evaluate` hook (`effect === "ask"`), with a fallback on the `permission.asked` event | 4 | `lock` |
| Agent asks a question | `form.created` event | 4 | `speech_balloon` |
| Blocking error | `session.execution.failed` and `session.step.failed` events | 5 | `rotating_light` |

Notes on the triggers:

- OpenCode v2 does **not** emit `session.idle` on the event stream, so the plugin
  keys the "task finished" notification off `session.execution.succeeded`.
  `session.idle` is still handled as a safety net in case a future version emits it.
- `form.replied` and `form.cancelled` are deliberately ignored — at that point you
  have already answered, so a notification would be noise.
- A "task finished" notification only fires if the session actually did some work,
  so starting OpenCode or opening an idle session stays quiet.
- Interrupting a session yourself never triggers a notification.

### De-duplication

Every notification goes through an in-memory TTL de-duplicator (15 s by default),
so a single moment produces a single push. This matters because some situations
surface through two channels:

- a permission request is seen by both the `evaluate` hook and the `permission.asked` event;
- an error is seen by both `session.step.failed` and `session.execution.failed`;
- a `form.created` event may be replayed if the event stream reconnects.

Tune it with `dedupeWindowMs` (set to `0` to disable).

### Privacy: `verbosity`

> ⚠️ **The default server `https://ntfy.sh` is public.** Topics are guessable and
> messages are readable by anyone who finds the topic. Keep sensitive details off
> it, or self-host ntfy.

`verbosity` controls what leaves your machine. The default is `minimal`.

| Value | Sent |
|---|---|
| `minimal` (default) | Project name plus a fixed sentence, e.g. `L'agent a terminé sa tâche.` No session title, no error message, no file paths, no resource paths. |
| `summary` | The category, plus the error **type** (e.g. `provider.quota`) or the permission **action** (e.g. `bash`). Still no error message, no paths, no session title. |
| `full` | Everything: session title, full error message, permission resources, question text. |

An unrecognised value falls back to `minimal`, so a typo can never silently switch
you to `full`. On startup the plugin logs a warning if `verbosity` is not `full`
while the server is `ntfy.sh`.

If you need `full`, self-host ntfy:

```bash
docker run -it --restart always -p 80:80 -v /var/lib/ntfy:/data binwiederhier/ntfy serve
```

Then set `server` to your instance URL and `token` to a token it accepts.

### Install

The plugin ships **compiled** in `dist/` as ESM. This matters: the directory
OpenCode loads a plugin from has no `node_modules` and no build step.

```bash
# global, all projects
git clone https://github.com/asphalt123/opencode-ntfy-notify.git
mkdir -p ~/.config/opencode/plugins/ntfy-notify
cp opencode-ntfy-notify/dist/*.js opencode-ntfy-notify/dist/*.d.ts ~/.config/opencode/plugins/ntfy-notify/
```

Or per project, into `.opencode/plugins/ntfy-notify/` inside your repository.

Copy **all** of `dist/`, not just `index.js` — the entrypoint imports its sibling
modules.

Then declare it in `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./plugins/ntfy-notify/index.js",
      "options": {
        "topic": "opencode-8f3k2",
        "verbosity": "minimal"
      }
    }
  ]
}
```

On startup OpenCode logs one of:

```
[ntfy-notify] actif : server=https://ntfy.sh topic=opencode-8f3k2 …
[ntfy-notify] désactivé (enabled=false), aucune notification ne sera envoyée.
```

To use a package build instead, `npm install opencode-ntfy-notify` and point
`package` at the package name.

#### Why the entrypoint does not import `@opencode/plugin`

This is the single most common way a v2 plugin silently fails to load.

```ts
// does NOT load under OpenCode v2
import { Plugin } from "@opencode/plugin"
export default Plugin.define({ id: "x", setup(ctx) {} })
```

A plugin that imports `@opencode/plugin` in its entrypoint will not load at all:
no `setup()`, no log line, no visible error. OpenCode resolves plugins from a
directory with no `node_modules`, the import fails, and the failure is swallowed.

So this package keeps the source in strict TypeScript while shipping an entrypoint
with no runtime imports:

- context types are declared locally in `src/types.ts`;
- their conformance with the real v2 API is checked at compile time by
  `typecheck/conformance.ts` (type-only import, never compiled into `dist/`);
- the built entrypoint imports nothing but its own relative modules and `node:path`;
- relative imports carry the `.js` extension in source and the build uses
  `module: nodenext`, so the output is real ESM that Node can load.

`Plugin.define()` is an identity function anyway — the default export of
`dist/index.js` is the plain `{ id, setup }` object the v2 loader expects.

### Configuration

All options are optional. Precedence: **`opencode.json` options > environment
variables > defaults**. See [`examples/opencode.jsonc`](./examples/opencode.jsonc).

| Option | Env var | Default | Description |
|---|---|---|---|
| `server` | `OPENCODE_NTFY_SERVER` | `https://ntfy.sh` | ntfy base URL |
| `topic` | `OPENCODE_NTFY_TOPIC` | `opencode-notify` | topic to publish to |
| `enabled` | `OPENCODE_NTFY_ENABLED` | `true` | master switch |
| `verbosity` | — | `minimal` | `minimal`, `summary` or `full` |
| `priorityCompleted` | — | `3` | task finished |
| `priorityPermission` | — | `4` | permission requested |
| `priorityQuestion` | — | `4` | agent asked a question |
| `priorityError` | — | `5` | blocking error |
| `notifyOnComplete` | — | `true` | enable the task-finished trigger |
| `notifyOnPermission` | — | `true` | enable the permission trigger |
| `notifyOnQuestion` | — | `true` | enable the question trigger |
| `notifyOnError` | — | `true` | enable the error trigger |
| `dedupeWindowMs` | — | `15000` | de-duplication window, `0` disables |
| `token` | `OPENCODE_NTFY_TOKEN` | — | bearer token for a private server |
| `click` | — | — | URL attached to notifications |
| `quiet` | — | `false` | send nothing at all |
| `dryRun` | `OPENCODE_NTFY_DRY_RUN` | `false` | log notifications instead of sending |

The plugin never reads a `.env` file. The token is never logged and never included
in a notification body — logs only show `token=set` or `token=unset`.

### Debugging

The plugin registers two helpers: a `ntfy_notify_test` tool and a `/ntfy-test`
command. Both send a test notification.

- **No `[ntfy-notify]` log line at all** — the plugin did not load. Check that
  every file from `dist/` was copied, that there is no `import "@opencode/plugin"`
  in the loaded JS, and that you restarted OpenCode. If two copies of the plugin
  are installed (once globally, once per project), the second one is rejected
  with `Duplicate plugin ID` — remove one.
- **No notifications** — check the topic matches your ntfy subscription exactly,
  that `enabled` is `true`, `quiet` is `false`, and the relevant `notifyOn*` switch
  is on. For a private server, check `server` and `token`. Network failures are
  logged (`[ntfy-notify] envoi refusé : HTTP …`) and never break OpenCode.
- **Nothing on a "task finished"** — that trigger requires real session activity,
  so an empty session staying quiet is expected.
- **Nothing when the agent asks a question** — confirm `notifyOnQuestion` is on.
  A form whose `id` is replayed within the de-duplication window produces a single
  notification, by design.
- **Start with `dryRun`** — set `"dryRun": true` (or
  `OPENCODE_NTFY_DRY_RUN=true`) to log notifications instead of sending them, then
  trigger `/ntfy-test` to verify loading end to end.

### Development

```bash
npm install
npm run typecheck   # tsc --noEmit (strict) + v2 API conformance
npm test            # compile src/ + test/, then node --test
npm run build       # tsc -p tsconfig.build.json -> dist/
npm run check       # all three
```

Tests never launch OpenCode. `test/harness.ts` provides a fake v2 context
(controllable event stream, `session.get`, `permission.hook`, tool/command
editors) and a local fake ntfy server on an ephemeral port that counts what it
receives. `emit(event)` waits for the plugin to have actually processed the event,
so the tests are deterministic and contain no sleeps.

| Path | Role |
|---|---|
| `src/index.ts` | entrypoint: `{ id, setup }`, hook and event wiring |
| `src/types.ts` | local v2 context types (no runtime import) |
| `src/definitions.ts` | custom tool and slash command definitions |
| `src/config.ts` | option → env → default resolution |
| `src/format.ts` | title/message construction and the `verbosity` filter |
| `src/ntfy.ts` | ntfy HTTP client (timeout, `dryRun`, non-fatal errors) |
| `src/state.ts` | TTL de-duplication and per-session activity tracking |
| `typecheck/conformance.ts` | type-only: local types vs the real v2 API |
| `test/harness.ts` | fake context + fake ntfy server (tests only) |
| `dist/` | committed ESM build (the plugin has no build step at install time) |

`dist/` is committed on purpose: installed from a local path, OpenCode loads
those `.js` files directly and never runs `tsc`. Conversely `test/` and
`typecheck/` are not compiled into `dist/`, so the shipped plugin carries no
development dependency.

### Requirements

OpenCode v2 (developed and tested against 2.0.19) and Node 22 or newer. The only
runtime dependency is the global `fetch`.

### License

MIT — see [LICENSE](./LICENSE).

---

## Français

### Ce que le plugin notifie

| Situation | Déclencheur | Priorité | Tag |
|---|---|---|---|
| Tâche terminée | event `session.execution.succeeded` | 3 | `white_check_mark` |
| Permission demandée | hook `permission.evaluate` (`effect === "ask"`), avec secours sur l'event `permission.asked` | 4 | `lock` |
| Question de l'agent | event `form.created` | 4 | `speech_balloon` |
| Erreur bloquante | events `session.execution.failed` et `session.step.failed` | 5 | `rotating_light` |

À noter sur les déclencheurs :

- OpenCode v2 **n'émet pas** `session.idle` sur le flux d'events : la notification
  « tâche terminée » s'appuie donc sur `session.execution.succeeded`.
  `session.idle` reste géré par sécurité, au cas où une version ultérieure
  l'émettrait.
- `form.replied` et `form.cancelled` sont volontairement ignorés : à ce moment-là
  vous avez déjà répondu, la notification serait inutile.
- La notification « tâche terminée » ne part que si la session a réellement
  travaillé : démarrer OpenCode ou ouvrir une session vide ne déclenche rien.
- Une interruption volontaire de votre part ne notifie jamais.

### Anti-doublons

Chaque notification passe par un déduplicateur en mémoire avec TTL (15 s par
défaut) : un même « moment » ne produit qu'une seule notification. C'est
nécessaire car certaines situations passent par deux canaux :

- une demande de permission est vue par le hook `evaluate` **et** l'event
  `permission.asked` ;
- une erreur est vue par `session.step.failed` **et** `session.execution.failed` ;
- un `form.created` peut être rejoué si le flux d'events se reconnecte.

Réglable via `dedupeWindowMs` (`0` désactive la dédup).

### Confidentialité : `verbosity`

> ⚠️ **Le serveur par défaut `https://ntfy.sh` est public.** Les topics sont
> devinables et les messages lisibles par quiconque. N'y mettez rien de sensible,
> ou auto-hébergez ntfy.

`verbosity` contrôle ce qui sort de votre machine. Le défaut est `minimal`.

| Valeur | Ce qui est envoyé |
|---|---|
| `minimal` (défaut) | Le nom du projet et une phrase fixe, par ex. « L'agent a terminé sa tâche. » Aucun titre de session, aucun message d'erreur, aucun chemin de fichier ni de ressource. |
| `summary` | La catégorie, plus le **type** d'erreur (ex. `provider.quota`) ou l'**action** de la permission (ex. `bash`). Toujours pas de message d'erreur, pas de chemin, pas de titre de session. |
| `full` | Tout : titre de session, message d'erreur complet, ressources de la permission, texte de la question. |

Une valeur non reconnue retombe sur `minimal` : une faute de frappe ne peut pas
basculer silencieusement en `full`. Au démarrage, le plugin journalise un
avertissement si `verbosity` n'est pas `full` alors que le serveur est `ntfy.sh`.

Si vous avez besoin de `full`, auto-hébergez ntfy :

```bash
docker run -it --restart always -p 80:80 -v /var/lib/ntfy:/data binwiederhier/ntfy serve
```

Puis indiquez l'URL de votre instance dans `server` et un token accepté dans `token`.

### Installation

Le plugin est livré **compilé** dans `dist/` (ESM). C'est important : le dossier
où OpenCode charge un plugin n'a pas de `node_modules` ni d'étape de build.

```bash
# global, tous les projets
git clone https://github.com/asphalt123/opencode-ntfy-notify.git
mkdir -p ~/.config/opencode/plugins/ntfy-notify
cp opencode-ntfy-notify/dist/*.js opencode-ntfy-notify/dist/*.d.ts ~/.config/opencode/plugins/ntfy-notify/
```

Ou par projet, dans `.opencode/plugins/ntfy-notify/` à la racine du dépôt.

Copiez **tout** `dist/`, pas seulement `index.js` : l'entrypoint importe ses
propres modules.

Déclarez ensuite le plugin dans `opencode.json` :

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./plugins/ntfy-notify/index.js",
      "options": {
        "topic": "opencode-8f3k2",
        "verbosity": "minimal"
      }
    }
  ]
}
```

Au démarrage, OpenCode journalise l'une de ces deux lignes :

```
[ntfy-notify] actif : server=https://ntfy.sh topic=opencode-8f3k2 …
[ntfy-notify] désactivé (enabled=false), aucune notification ne sera envoyée.
```

Pour utiliser une version publiée : `npm install opencode-ntfy-notify`, et
indiquez le nom du paquet dans `package`.

#### Pourquoi l'entrypoint n'importe pas `@opencode/plugin`

C'est la manière la plus courante de faire échouer silencieusement un plugin v2.

```ts
// ne se charge PAS sous OpenCode v2
import { Plugin } from "@opencode/plugin"
export default Plugin.define({ id: "x", setup(ctx) {} })
```

Un plugin qui importe `@opencode/plugin` dans son entrypoint ne se charge pas du
tout : pas de `setup()`, pas de log, pas d'erreur visible. OpenCode résout les
plugins depuis un dossier sans `node_modules`, l'import échoue, et l'échec est
avalé.

Ce dépôt garde donc le source en TypeScript strict tout en livrant un entrypoint
sans import runtime :

- les types du contexte sont déclarés localement dans `src/types.ts` ;
- leur conformité avec l'API v2 réelle est vérifiée à la compilation par
  `typecheck/conformance.ts` (import de types uniquement, jamais compilé dans
  `dist/`) ;
- l'entrypoint compilé n'importe rien d'autre que ses modules relatifs et
  `node:path` ;
- les imports relatifs portent l'extension `.js` dans le source et le build est en
  `module: nodenext`, donc le `dist/` produit est du vrai ESM lisible par Node.

`Plugin.define()` est de toute façon une simple fonction identité : le default
export de `dist/index.js` est l'objet `{ id, setup }` attendu par le loader v2.

### Configuration

Toutes les options sont optionnelles. Précédence : **options `opencode.json` >
variables d'environnement > défauts**. Voir
[`examples/opencode.jsonc`](./examples/opencode.jsonc).

| Option | Variable d'env | Défaut | Description |
|---|---|---|---|
| `server` | `OPENCODE_NTFY_SERVER` | `https://ntfy.sh` | URL de base ntfy |
| `topic` | `OPENCODE_NTFY_TOPIC` | `opencode-notify` | topic de publication |
| `enabled` | `OPENCODE_NTFY_ENABLED` | `true` | interrupteur principal |
| `verbosity` | — | `minimal` | `minimal`, `summary` ou `full` |
| `priorityCompleted` | — | `3` | tâche terminée |
| `priorityPermission` | — | `4` | permission demandée |
| `priorityQuestion` | — | `4` | question de l'agent |
| `priorityError` | — | `5` | erreur bloquante |
| `notifyOnComplete` | — | `true` | active le déclencheur « terminé » |
| `notifyOnPermission` | — | `true` | active le déclencheur « permission » |
| `notifyOnQuestion` | — | `true` | active le déclencheur « question » |
| `notifyOnError` | — | `true` | active le déclencheur « erreur » |
| `dedupeWindowMs` | — | `15000` | fenêtre de dédup, `0` désactive |
| `token` | `OPENCODE_NTFY_TOKEN` | — | token bearer pour un serveur privé |
| `click` | — | — | URL jointe aux notifications |
| `quiet` | — | `false` | n'envoie rien du tout |
| `dryRun` | `OPENCODE_NTFY_DRY_RUN` | `false` | journalise au lieu d'envoyer |

Le plugin ne lit jamais de fichier `.env`. Le token n'est jamais journalisé ni
inclus dans le corps d'une notification — les logs n'affichent que
`token=set` ou `token=unset`.

### Dépannage

Le plugin expose deux aides : un tool `ntfy_notify_test` et une commande
`/ntfy-test`. Les deux envoient une notification de test.

- **Aucune ligne `[ntfy-notify]` dans les logs** — le plugin ne s'est pas chargé.
  Vérifiez que tous les fichiers de `dist/` ont bien été copiés, qu'il n'y a pas
  de `import "@opencode/plugin"` dans le JS chargé, et que vous avez redémarré
  OpenCode. Si deux copies du plugin sont installées (une globale, une par
  projet), la seconde est rejetée avec `Duplicate plugin ID` : supprimez-en une.
- **Aucune notification** — vérifiez que le topic correspond exactement à votre
  abonnement ntfy, que `enabled` est `true`, `quiet` est `false`, et que le
  `notifyOn*` concerné est activé. Pour un serveur privé, vérifiez `server` et
  `token`. Les échecs réseau sont journalisés
  (`[ntfy-notify] envoi refusé : HTTP …`) et ne font jamais échouer OpenCode.
- **Rien sur « tâche terminée »** — ce déclencheur exige une activité réelle de
  la session : une session vide qui reste silencieuse est normal.
- **Rien quand l'agent pose une question** — vérifiez `notifyOnQuestion`. Un
  formulaire dont l'`id` est rejoué dans la fenêtre de dédup ne produit qu'une
  seule notification, c'est voulu.
- **Commencez par `dryRun`** — mettez `"dryRun": true` (ou
  `OPENCODE_NTFY_DRY_RUN=true`) pour journaliser les notifications au lieu de les
  envoyer, puis déclenchez `/ntfy-test` pour vérifier le chargement de bout en bout.

### Développement

```bash
npm install
npm run typecheck   # tsc --noEmit (strict) + conformité API v2
npm test            # compile src/ + test/ puis node --test
npm run build       # tsc -p tsconfig.build.json -> dist/
npm run check       # les trois
```

Les tests ne lancent jamais OpenCode. `test/harness.ts` fournit un faux contexte
v2 (flux d'events contrôlable, `session.get`, `permission.hook`, editors
tool/command) et un faux serveur ntfy local sur un port éphémère qui compte ce
qu'il reçoit. `emit(event)` attend que le plugin ait réellement traité l'event :
les tests sont déterministes, sans `sleep`.

| Chemin | Rôle |
|---|---|
| `src/index.ts` | entrypoint : `{ id, setup }`, hooks et events |
| `src/types.ts` | types v2 locaux (aucun import runtime) |
| `src/definitions.ts` | définitions du tool custom et de la commande slash |
| `src/config.ts` | résolution option → env → défaut |
| `src/format.ts` | construction des titres/messages et filtre `verbosity` |
| `src/ntfy.ts` | client HTTP ntfy (timeout, `dryRun`, erreurs non fatales) |
| `src/state.ts` | dédup TTL et suivi d'activité par session |
| `typecheck/conformance.ts` | type-only : types locaux vs API v2 réelle |
| `test/harness.ts` | faux contexte + faux serveur ntfy (tests uniquement) |
| `dist/` | build ESM versionné (le plugin n'a pas d'étape de build à l'installation) |

`dist/` est versionné volontairement : installé depuis un chemin local, OpenCode
charge directement ces `.js` sans jamais lancer `tsc`. À l'inverse, `test/` et
`typecheck/` ne sont pas compilés dans `dist/`, donc le plugin livré n'a aucune
dépendance de développement.

### Prérequis

OpenCode v2 (développé et testé sur 2.0.19) et Node 22 ou plus récent. Seule
dépendance runtime : le `fetch` global.

### Licence

MIT — voir [LICENSE](./LICENSE).
