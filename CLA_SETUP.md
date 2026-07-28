# CLA Setup — internal note, not a public doc

This file is for you, not necessarily for the public repo. Delete or move
it out of the published tree once the CLA is actually wired up.

## Why this needs to happen before your first outside PR merges
Once a contributor's code is merged without a CLA, retroactively getting
relicensing rights over that code requires contacting them individually
and asking them to sign after the fact — some won't, some will be
unreachable. Setting this up first avoids the problem entirely.

## Steps

1. **Generate the CLA text** — use a proper, contributor-friendly
   template rather than freehand legal text:
   - https://harmonyagreements.org — generates a "License Grant" CLA
     (contributor keeps copyright, grants broad license including
     relicensing rights). This is the type to pick, not the "Copyright
     Assignment" variant.
2. **Wire it into GitHub** — use one of:
   - [CLA Assistant](https://cla-assistant.io) — free, GitHub App,
     auto-comments on PRs with a sign link, blocks merge until signed.
   - [EasyCLA](https://easycla.lfx.linuxfoundation.org) — used by many
     Linux Foundation projects, also free.
3. **Store the signed CLA text** in the repo (e.g. `CLA.md`) so
   contributors can read exactly what they're agreeing to before they
   open a PR.
4. **Reference it** from `CONTRIBUTING.md` (already done in the template
   provided) so it's visible before someone starts writing code.

## A note on wording
Have an actual lawyer glance over the final generated CLA text before
your project has enough contributors that changing it becomes painful —
not required to launch, but worth doing once the project has real
traction or the marketplace starts generating revenue.
