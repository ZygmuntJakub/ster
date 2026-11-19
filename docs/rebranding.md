# Rebranding Ster

Ster’s visible product identity is single-sourced from
`apps/desktop/resources/brand.json`. Change that file, rebuild, and the window title,
about panel, user-data directory segment, policy directory name, installer `appId` /
`productName`, and artifact names follow.

## Fields

| Field           | Effect                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `productName`   | Window title, about panel, electron-builder `productName`, artifact prefix |
| `appId`         | electron-builder `appId` (keep reverse-DNS if you ship updates later)      |
| `dataDirName`   | Subfolder under the OS user-data path for SQLite / settings                |
| `policyDirName` | Machine policy directory name (organization policy, US10)                  |
| `icon`          | Filename under `apps/desktop/resources/` used by packaging                 |
| `colors`        | Accent / surface tokens consumed by the desktop host                       |

Validation is strict (`parseBrand` / `loadBrandFromJson` in `@ster/core`): unknown keys and
empty required strings are rejected.

## Steps

1. Edit `apps/desktop/resources/brand.json`.
2. Replace `apps/desktop/resources/icon.png` (and any platform icon sets you add).
3. Optionally rename the pnpm package / repo — not required for end-user branding.
4. Run `pnpm --filter @ster/desktop test` (includes `tests/brand.test.ts`) and
   `pnpm --filter @ster/desktop dist` when you are ready to package.

`apps/desktop/electron-builder.config.mjs` reads `brand.json` at pack time so installer
names cannot drift from the brand file.
