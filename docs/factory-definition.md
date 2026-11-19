# Factory definition

A factory definition lives in the project repository as `.ster/factory.yaml`.
It is versioned with the code and shared by the team. Ster never applies it until
someone trusts it for that folder, and it never overrides organization policy.

Schema: [`specs/001-acp-desktop-client/contracts/factory.schema.json`](../specs/001-acp-desktop-client/contracts/factory.schema.json).

## Lookup

Ster walks from the session working folder upward and uses the nearest
`.ster/factory.yaml`. Nested projects can override a parent definition.

## Trust

Trust is stored locally per absolute folder path with the SHA-256 of the file
contents. States:

| State       | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `untrusted` | No trust record                                 |
| `trusted`   | Hash matches the trusted record                 |
| `changed`   | A trust record exists but the file hash differs |

Only `trusted` definitions are applied. When the file changes, Ster asks again.

## Items

| Item             | Purpose                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `version`        | Must be `1`                                                                                      |
| `agents`         | List of `{ id }` registry/detected agents and/or `{ name, command, args?, env? }` command agents |
| `defaultAgent`   | Id or name from `agents` to preselect                                                            |
| `permissionMode` | Default permission mode for sessions in this folder                                              |
| `templates`      | Task templates with `{{inputName}}` blanks                                                       |
| `judging`        | Criteria and optional scale for later scoring (US12)                                             |

Command-declared agents always require first-start confirmation. Template blanks
are filled with plain text only — inputs are never evaluated as code.

## Complete example

```yaml
version: 1
agents:
  - id: mock-agent
  - name: Local Reviewer
    command: node
    args: ["./tools/reviewer.js"]
    env:
      REVIEW_STRICT: "1"
defaultAgent: mock-agent
permissionMode: ask-with-rules
templates:
  - id: fix-bug
    title: Fix a bug
    description: Structured bug-fix request
    prompt: |
      Fix the bug described below.

      Summary: {{summary}}
      Steps to reproduce: {{steps}}
    inputs:
      - name: summary
        label: Summary
      - name: steps
        label: Steps to reproduce
        default: "1. …"
judging:
  scale:
    min: 0
    max: 10
  criteria:
    - id: correctness
      description: Does the change fix the reported issue?
      weight: 2
    - id: clarity
      description: Is the change easy to review?
```

Place this file at `<project>/.ster/factory.yaml`, open the project folder in Ster,
and trust the definition when prompted.
