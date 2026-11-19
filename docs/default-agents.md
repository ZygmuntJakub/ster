# Default agents

Development and test builds expose the **mock agent** (`mock-agent`) so sessions work
without a vendor install. Production-oriented builds omit it when `NODE_ENV=production`
and the mock entry is absent.

## Where defaults come from

| Source                    | Role                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| Built-in mock agent       | Local ACP fixture; `includeMockAgent` in `createCore` / desktop `core-host` |
| ACP registry              | Discovered / installable agents (`AgentService` + registry client)          |
| PATH detection            | Hints in `apps/desktop/resources/agent-hints.json`                          |
| Custom agents             | Saved via Settings / Agents UI (`Settings.customAgents`)                    |
| `Settings.defaultAgentId` | Optional preferred agent for new sessions                                   |

## Changing what adopters see first

1. **Hints** — edit `apps/desktop/resources/agent-hints.json` so PATH detection recognizes
   your preferred CLIs.
2. **Registry** — point `STER_REGISTRY_URL` (or future organization policy) at your index;
   see US10 for locking registry mode.
3. **Custom seed** — ship a documented custom-agent recipe, or pre-seed settings in your
   fork after first run (settings live under the brand `dataDirName`).
4. **Remove the mock agent** — ensure production packaging does not ship
   `packages/mock-agent` as a launchable entry; desktop already gates on non-production.

Organization policy (US10) can further allow-list agents and disable custom agents; that
always wins over user defaults.
