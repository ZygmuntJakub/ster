# Accessibility notes

Keyboard and contrast pass over the main Ster flows (Phase 15 / T179).

## Keyboard

| Flow          | Behaviour                                                                         |
| ------------- | --------------------------------------------------------------------------------- |
| Icon rail     | Tab moves between Conversation, Agents, Runs, Settings; Enter/Space activates     |
| Session board | Tab to session cards and New; Enter selects / opens                               |
| Composer      | Tab to message field, Attach, Send/Stop; Enter sends when focused in the field    |
| Approvals     | Tab through options; Enter confirms; Escape cancels where a Cancel control exists |
| Dialogs       | Focus stays inside modal surfaces (folder pick, trust, install, templates)        |
| Runs          | Tab through filters, list rows, rating controls, and Judge                        |

## Contrast

- Light theme tokens in `apps/desktop/src/renderer/styles/` keep body text on `--ink` over `--bg` / `--surface`.
- Muted labels use `--ink2` and meet a readable secondary contrast for short helper copy.
- Focus rings use the existing `.btn` / input focus styles (visible outline on interactive controls).
- Status chips keep dark-on-tint or light-on-dark combinations already used in the session board.

## Fixes recorded in this pass

- Conversation transcript exposes `role="log"` with `aria-live="polite"` for new items.
- Session title carries `data-session-id` for assistive testing hooks without changing visible copy.
- Runs and Agents panes keep an `aria-label` on their primary section.

## Out of scope / follow-ups

- Full screen-reader scripted suite on Windows Narrator / Linux Orca (covered here on macOS VoiceOver spot-check intent only).
- High-contrast OS theme variants beyond the built-in light/dark/system setting.
