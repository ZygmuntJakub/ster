# Security Policy

## Supported versions

Security fixes are accepted for the latest published release on the `main` branch.
Pre-release and development branches are not supported for vulnerability reports
except as part of coordinated disclosure before the first release.

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public GitHub issue for
vulnerabilities that could let an attacker run code, leave the working folder, or
exfiltrate credentials.

Preferred channel: open a private [GitHub security advisory](https://github.com/ZygmuntJakub/ster/security/advisories/new)
on this repository, or email the maintainer listed in the repository profile.

Include:

- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- affected version or commit, if known

You should receive an acknowledgement within 7 days. We will keep you informed of
progress and credit reporters who want to be named once a fix is published.

## Scope notes for Ster

- Ster never handles, stores, or transmits model-provider credentials. Reports that
  require Ster to accept API keys are out of scope for product changes.
- Agent output, registry data, and factory definitions are untrusted input. Bypass of
  Markdown sanitization, the typed bridge, workspace confinement, or install integrity
  checks are in scope.
- Unsigned installers (until signing certificates are configured) are a known limitation
  documented in the specification; please do not file that alone as a vulnerability.
