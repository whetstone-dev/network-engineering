# Contributing

Thanks for improving the skill! Short rules:

## Before opening a PR

```bash
node --test scripts/test/*.test.ts
node scripts/review/sync-example-artifacts.ts --check
for f in examples/*.net.json; do
  case "$f" in *broken*) continue ;; esac
  node scripts/netlab.ts validate "$f" || exit 1
done
if node scripts/netlab.ts validate examples/troubleshooting-broken-lab.net.json; then exit 1; fi
```

- Requires Node.js ≥ 22.18 (native TypeScript). **Do not add npm dependencies**: the skill must work by just copying the folder.
- If you change a generator or the viewer, re-render all examples: `node scripts/review/sync-example-artifacts.ts` (includes the broken lab and diff diagram).
- For a reproducible comparison against the original tracked commit, run `node scripts/review/compare-hardening.ts`. It reads git history and writes comparison evidence; it does not commit or push.
- New model fields: update `scripts/lib/model.ts`, `schemas/network-model.schema.json` and `references/model.md` (the tests validate every example against the schema).
- New Packet Tracer models: `scripts/lib/catalog.ts` (the device's real interfaces).

## Cisco commands

The skill's main rule is **never invent commands**. Every new command in a generator or reference must:
- exist on the stated platform (IOS 15, IOS XE, ASA, Packet Tracer) with that exact syntax;
- be marked `[PT?]` / "verify" when Packet Tracer support is uncertain;
- come with a test in `scripts/test/` when it is generated from the model.

## Style

- Documentation and user-facing text in English; function names in English.
- Explicit error handling (clear messages, no stack traces for user errors).
- Prefer simple solutions; document the simulation's approximations.

## Releases

We follow [SemVer](https://semver.org/). Add your change to `CHANGELOG.md` under **[Unreleased]**. To release: bump `metadata.version` in `SKILL.md`, move the entries to the new version, create the `vX.Y.Z` tag and the GitHub release.
