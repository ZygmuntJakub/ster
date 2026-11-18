# Run records

Ster keeps one run record for every agent turn. Records stay on the machine that
created them. Export writes a local file; Ster never uploads run data.

Schema: [`specs/001-acp-desktop-client/contracts/run-record.schema.json`](../specs/001-acp-desktop-client/contracts/run-record.schema.json).

## Export format

Export is **JSON Lines** (`.jsonl`): one UTF-8 JSON object per line, no wrapping
array. Each line is a single run record matching the schema above.

Example (two lines, abbreviated):

```json
{"schemaVersion":1,"id":"…","sessionId":"…","kind":"task","request":"Fix the flaky test","agent":{"id":"mock-agent","name":"Mock Agent","version":"0.0.0"},"permissionMode":"always-ask","cwd":"/projects/demo","startedAt":"2026-11-18T12:00:00.000Z","endedAt":"2026-11-18T12:00:04.000Z","durationMs":4000,"outcome":"completed","actions":[],"approvals":[],"commands":[],"scores":[]}
{"schemaVersion":1,"id":"…","sessionId":"…","kind":"judging","request":"scenario: judge …","agent":{"id":"mock-agent","name":"Mock Agent"},"permissionMode":"always-ask","cwd":"/projects/demo","startedAt":"2026-11-18T12:01:00.000Z","endedAt":"2026-11-18T12:01:02.000Z","outcome":"completed","actions":[],"approvals":[],"commands":[],"scores":[]}
```

## Reading with a third-party tool

Any tool that can stream lines and parse JSON works. Example in Python:

```python
import json

with open("ster-runs.jsonl", encoding="utf-8") as handle:
    for line in handle:
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        assert record["schemaVersion"] == 1
        print(record["id"], record["outcome"], record["agent"]["id"])
```

In Node.js:

```js
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

for await (const line of createInterface({ input: createReadStream("ster-runs.jsonl") })) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  console.log(record.id, record.outcome);
}
```

## Field notes

| Field                                | Notes                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `kind`                               | `task` for normal turns; `judging` for on-demand scoring sessions                                              |
| `request`                            | User prompt text, or `null` when a session was deleted with “keep records without text”                        |
| `outcome`                            | `completed`, `cancelled`, `failed`, or `interrupted`                                                           |
| `actions` / `approvals` / `commands` | What happened during the turn (no file contents)                                                               |
| `usage`                              | Present only when the agent reported usage; absent means unknown                                               |
| `scores`                             | User ratings (`source: "user"`, scale 1–5) and agent scores (`source: "agent"`, factory scale) are never mixed |

## Judging

Judging uses a separate hidden ACP session with write and terminal capabilities
disabled. Criteria come from the trusted factory definition’s `judging` block.
Organization policy still applies to the judging agent.
