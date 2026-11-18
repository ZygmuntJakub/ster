# Release checklist

Use this list for every tagged release (`vMAJOR.MINOR.PATCH`).

## Before the tag

1. `pnpm check`, `pnpm test:e2e`, `pnpm test:security`, `pnpm example:headless` green locally.
2. Update [CHANGELOG.md](../CHANGELOG.md):
   - User-facing Added / Changed / Fixed
   - **Extension contract** section: any break to `PanelExtension`, `AgentSource`,
     `PermissionModeDefinition`, `PolicyItemDefinition`, `SessionEventConsumer`, or
     translation registration (FR-062)
3. Confirm `apps/desktop/resources/brand.json` is correct for the build you intend to ship.
4. Confirm signing secrets (or the intentional unsigned / ad hoc path) — [signing.md](./signing.md).

## Tag and ship

1. `git tag vX.Y.Z && git push origin vX.Y.Z`
2. GitHub Actions **Release** workflow:
   - Builds on macOS, Windows, Ubuntu
   - Verifies macOS `codesign --verify`
   - Runs packaged smoke (`apps/desktop/tests/e2e/packaged-smoke.spec.ts`) per OS
   - Uploads installers and opens a **draft** GitHub Release
3. Download draft assets, spot-check one installer per platform.
4. Publish the GitHub Release when ready; announce changelog highlights.

## Afterward

- File follow-ups for any skipped smoke coverage (for example Linux display flakiness).
- Bump the Unreleased section in the changelog for the next cycle.

## Quickstart validation log (T182)

Automated gates from `specs/001-acp-desktop-client/quickstart.md` recorded for this feature branch:

| Gate                    | macOS (agent host)            | Windows                 | Linux                   |
| ----------------------- | ----------------------------- | ----------------------- | ----------------------- |
| `pnpm check`            | Pass (recorded with Phase 15) | Via CI Release workflow | Via CI Release workflow |
| `pnpm test:e2e`         | Pass (recorded with Phase 15) | Via CI packaged smoke   | Via CI packaged smoke   |
| `pnpm test:security`    | Pass (recorded with Phase 15) | Via CI                  | Via CI                  |
| `pnpm example:headless` | Pass (recorded with Phase 15) | Via CI                  | Via CI                  |

Manual increment tables were covered earlier by story e2e/integration suites on macOS; full interactive walks on Windows/Linux desktop remain CI/release-spot-check territory.
