# Adding a language

Ster ships English (`en`) and Polish (`pl`). Interface copy lives in
`apps/desktop/src/renderer/i18n/`. Main-process dialogs reuse the same JSON catalogs via
`apps/desktop/src/main/i18n.ts`.

## Steps

1. Copy `apps/desktop/src/renderer/i18n/en.json` to `xx.json` (your BCP-47 primary tag).
2. Translate every leaf string. Keep interpolation placeholders (`{{name}}`) intact.
3. For plurals, provide i18next suffix keys for every category your language needs, and
   mirror the same key set in `en.json` / `pl.json` so `scripts/check-i18n.mjs` stays green
   (example: `board.sessionCount_one`, `_few`, `_many`, `_other`).
4. Register the language:
   - `apps/desktop/src/renderer/i18n/index.ts` — add the import and `resources` entry.
   - `apps/desktop/src/main/language.ts` — extend `SUPPORTED_APP_LANGUAGES` and
     `resolveAppLanguage`.
   - `apps/desktop/src/renderer/features/settings/LanguageSettings.tsx` — add an `<option>`.
5. Run `node scripts/check-i18n.mjs` (also part of `pnpm check`). It enforces EN/PL (and
   any other registered files you add to the script) key parity and fails on hard-coded
   renderer UI strings.

First launch picks the OS locale when it matches a supported language; otherwise English.
Users can switch live in Settings without restarting.
