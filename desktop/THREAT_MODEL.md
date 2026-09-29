# MIRAGE Desktop — Threat model

## Assets
User prompts · secrets (keys, passwords, private keys) · personal data · the placeholder map (in memory, per session) · settings · statistics (counts) · the Accessibility permission itself.

## Trust boundaries
1. **User ⇄ AI app.** MIRAGE sits on this boundary through Accessibility + the event tap.
2. **AI app ⇄ AI provider.** Only what the app sends crosses; MIRAGE's job is that this is the protected text.
3. **MIRAGE process ⇄ everything else.** Trusted: MIRAGE's code, the bundled core, macOS. Untrusted: the AI apps and their content (including replies), other local processes, files on disk.

## Attack surfaces and mitigations

| Threat | Surface | Mitigation | Residual risk |
|---|---|---|---|
| **Accessibility abuse** (MIRAGE as spyware) | AX + event tap | Only adapters' apps are observed, only while in front. Tap looks at Return's key code and mouse-down positions only; never characters; nothing recorded. No Screen Recording, microphone or network. | Accessibility is powerful by nature: users must trust the signed binary. |
| **Keylogging concern** | Event tap | Tap disabled unless a protected app is in front. Only Return/Enter and left clicks are examined; the tap has no storage. | The OS lets any AX-trusted app see key events; this is policy in code, reviewable. |
| **Malicious local process spoofing IPC** | — | No IPC exists (one process). Debug hooks (`--debug-hooks`) accept distributed notifications, **only when launched with that flag** for development. | A developer running with `--debug-hooks` lets local processes trigger Protect/Cancel on an open decision. |
| **Compromised / malicious AI app** | AX tree, replies | Text read from the app is data, never instructions. Reply check never rewrites replies. Every write is verified by reading back. | A compromised app can read what the user types in it before MIRAGE acts; MIRAGE protects what is *sent*. |
| **Prompt injection / malicious reply** | Replies | Replies only produce a warning; MIRAGE never acts on reply content. | — |
| **Late or ignored writes** (race) | Electron editors | Writes verified only after the box settles; failure → restore original → true message. | An app that changes its editor model could desync display and send (why ChatGPT uses typed input). |
| **Log leakage** | OSLog | Logs name types, counts and fixed codes only; a unit test fails the build if a log line interpolates text. | — |
| **Storage compromise** | `~/Library/Application Support/MIRAGE` | Settings (switches) and counts only, 0600, directory 0700. No prompts, no values, no placeholder map on disk. | — |
| **Memory leakage** | Process memory | Raw values live only for the length of a decision; the placeholder map is per session, in memory, cleared on quit or on demand. | A memory dump of a running MIRAGE could show a held prompt. |
| **Malicious update / supply chain** | Build | Core has 2 runtime deps (none in the desktop bundle beyond the core JS); Swift package has no third-party deps. Signed with a pinned requirement. | No notarization or auto-update yet (see DEVELOPMENT.md). |
| **Permission drift** | TCC | Pinned designated requirement; permission revocation detected and the tap removed. | — |

## Failure policy
Fail closed where MIRAGE knows the user is sending from the prompt box (held + message). Fail open only where there is no sign of a send from a prompt box (Return in another field), so MIRAGE never traps normal typing.
