# Signing installers

This template ships **unsigned** Windows/Linux installers and **ad hoc signed** macOS app
bundles (required for Apple silicon). Plug in your own credentials when you are ready to
distribute outside your laptop.

Packaging config: `apps/desktop/electron-builder.config.mjs` (names from
`resources/brand.json`).

## macOS

| Variable / setting            | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `CSC_LINK`                    | Path or base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD`            | Password for that certificate                         |
| `APPLE_ID`                    | Apple ID for notarization                             |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password                                 |
| `APPLE_TEAM_ID`               | Team ID                                               |

When `CSC_LINK` is unset, electron-builder keeps an ad hoc signature.
`.github/workflows/release.yml` runs `codesign --verify` on the `.app` after the dir build.

For notarization, enable electron-builder’s `notarize` / `afterSign` hooks in your fork
once the Apple credentials above are available in CI secrets.

## Windows

| Variable           | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `CSC_LINK`         | Path or base64 of the Authenticode `.pfx` |
| `CSC_KEY_PASSWORD` | Certificate password                      |

NSIS targets are `x64` and `arm64`. SmartScreen reputation still takes time after you
start signing.

## Linux

AppImage and deb builds do not require platform code signing for basic distribution.
Optional GPG packaging signatures are left to the adopter’s apt/yum pipeline.

## CI

`release.yml` sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so missing certs do not fail the
job. Remove that override when secrets are configured. Never commit certificate files;
use GitHub Actions secrets or your org’s secret store.
