// Types locaux du contexte OpenCode v2 réellement utilisés par le plugin.
//
// Pourquoi ne pas importer `@opencode/plugin` ici :
// opencode charge le plugin depuis un dossier `.opencode/plugins/<nom>/` (ou
// `~/.config/opencode/plugins/<nom>/`) qui n'a PAS de `node_modules`. Un import
// — même « seulement de types » si le transpiler le conserve — y échoue et le
// plugin n'est jamais chargé, sans message d'erreur. Voir le README.
//
// On déclare donc ici un `PluginContext` minimal, en `local`, et la conformité
// avec l'API v2 réelle est vérifiée à la compilation par `typecheck/conformance.ts`
// (imports de types uniquement, jamais compilé dans `dist/`).
//
// Note : `exactOptionalPropertyTypes` est activé, donc toutes les propriétés
// optionnelles déclarent explicitement `| undefined` — sans quoi le type local
// n'est pas assignable depuis le type réel.
export {};
