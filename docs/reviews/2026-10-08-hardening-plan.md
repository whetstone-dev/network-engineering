# Network engineering hardening review

The local checkout is v1.1.1. The existing 21 toolkit tests pass on Windows with Node 24.15.0. The supplied review correctly identifies missing generation gates, permissive device IDs, imported unrecognized commands, secrets in HTML and Markdown, and implicit persistence in both IOS and ASA output.

Preserve the model-first architecture and dependency-free runtime. Implement this bounded hardening pass before adding simulation features:

1. Add regression tests for invalid CLI builds/configs, strict and inconclusive validation, malformed models, identifiers and command injection. Make schema validation non-mutating and stop before semantic analysis on structural errors. Unknown fields are errors; relaxed discovery is explicit and cannot generate configs.
2. Gate config/build before writes. Strict mode also rejects warnings. Diagnostic builds may write reports for semantically broken networks, return nonzero, and omit configs. Reject unsupported flags and missing values.
3. Validate internal IDs, introduce an optional separate hostname, reject filesystem collisions, and check output containment and existing symlinks before writes.
4. Redact configuration previews by default. Explicit secret-bearing configs stay separate from HTML, Markdown, diagnostic JSON and diff output. Quarantine unknown imported lines without retaining their values, and never re-emit extraConfig. Remove implicit write memory.
5. Shorten skill activation, add workflow and evidence rules, document toolkit limits and .pkt limitations, and reconcile stale references and contributor checks.
6. Run all toolkit regressions, healthy and intentionally broken examples, generated artifact synchronization, and a second behavioral review. Add Windows to CI and run every toolkit test file.

Acceptance: invalid models produce no successful configuration build; required unknown tests block config generation; supplied secret fixtures do not appear in shareable outputs; hostile IDs and multiline CLI fields cannot generate commands or escape the destination; existing healthy scenarios still work.

TCP/UDP flow tests, IPv6 traces, live-device integration, secret-manager resolution, capability/version registries and static TypeScript checking remain separate follow-up work. No deployment, release, commit or remote publication is part of this pass.

Completed locally. The identical 47-test comparison improves from 25 passing / 22 failing on v1.1.1 to 47 passing / 0 failing, preserving all original 21 tests. All eight example diagrams are synchronized. The browser comparison confirms the old exploit, the existing v1.1.1 escape fix, and the stronger current text/class boundaries. See [the comparison report](2026-10-08-hardening-comparison.md) for evidence, compatibility changes and remaining limits.
