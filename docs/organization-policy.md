# Organization policy

Ster can be restricted for an organization with a single JSON policy document.
Policy only **restricts** what the application offers: it never adds capabilities.

Schema: [`specs/001-acp-desktop-client/contracts/policy.schema.json`](../specs/001-acp-desktop-client/contracts/policy.schema.json).

## Delivery routes

1. **Built-in** — packaged with the app as `resources/policy.default.json`.
2. **Machine** — administrator-writable location derived from `Brand.policyDirName`:

| Platform | Path                                                       |
| -------- | ---------------------------------------------------------- |
| macOS    | `/Library/Application Support/<policyDirName>/policy.json` |
| Windows  | `%ProgramData%\<policyDirName>\policy.json`                |
| Linux    | `/etc/<policyDirName>/policy.json`                         |

Sources merge **per top-level item** (`agents`, `registry`, `install`, `permissions`). The machine source wins when both define the same item. Policy is read **once at start**; changes apply on the next launch.

## States

| State     | Meaning                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `absent`  | No policy document from any source                                                                    |
| `valid`   | Documents validated and merged                                                                        |
| `invalid` | Present but schema/extension-invalid — **new sessions blocked** (fail closed); history stays readable |

## Items

| Item                          | Unset means                                |
| ----------------------------- | ------------------------------------------ |
| `agents.allow`                | All agents allowed                         |
| `agents.customAllowed`        | Custom agents allowed (`true`)             |
| `registry.mode`               | `public`                                   |
| `registry.url`                | Required when `mode` is `custom` (https)   |
| `install.requireChecksum`     | Checksums optional (`false`)               |
| `install.allowInstallScripts` | Users may opt in (`true`)                  |
| `permissions.modes`           | All built-in/extension modes               |
| `permissions.default`         | `always-ask` (must be in `modes` when set) |

Extension keys must be namespaced `x-…` and registered through `PolicyItemDefinition`. Extensions may only tighten restrictions.

## Example: fixed agent set

A company that allows only `acme-coder`, disables custom agents, pins a private registry, requires checksums, and locks permission modes:

```json
{
  "version": 1,
  "agents": {
    "allow": ["acme-coder"],
    "customAllowed": false
  },
  "registry": {
    "mode": "custom",
    "url": "https://registry.example.com/acp/v1/registry.json"
  },
  "install": {
    "requireChecksum": true,
    "allowInstallScripts": false
  },
  "permissions": {
    "modes": ["always-ask", "ask-with-rules"],
    "default": "always-ask"
  }
}
```

Place this file at the machine path for your platform (see table above), using the product’s `policyDirName` from `resources/brand.json` (Ster → `Ster`). Restart Ster after deploying.

With `registry.mode` set to `custom` or `disabled`, Ster does not contact the public ACP registry for the index or icons.
