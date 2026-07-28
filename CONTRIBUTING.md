# Contributing to SuperAgent

Thanks for your interest in contributing. A few things to know before you
open a pull request.

## Before your first contribution: sign the CLA

All contributions require signing our Contributor License Agreement (CLA)
**before** a pull request can be merged. A bot will automatically comment
on your first PR with a link to sign — it takes about a minute.

**Why a CLA, not just a DCO:** you keep full copyright ownership of your
contribution. You're granting the project a license broad enough to
include the ability to relicense the combined project in the future
(e.g., dual-licensing, commercial exceptions) without having to track
down and re-contact every individual contributor. The public project
itself stays Apache 2.0 — the CLA does not change what license *you*
receive the code under.

If you disagree with the CLA terms, please open an issue to discuss before
submitting code — we'd rather talk it through than merge something you're
not comfortable with.

## How to contribute

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep commits focused and messages descriptive.
3. Add or update tests for any behavior change.
4. Run the full build/test suite locally before opening a PR — CI will
   also run it, but catching failures early saves everyone time.
5. Open a pull request describing what changed and why.
6. Sign the CLA when prompted.
7. A maintainer will review — nothing merges to `main` without manual
   review, regardless of what automation or agent tooling produced it.

## What we look for in a good PR

- Focused scope — one logical change per PR
- Tests for new behavior or bug fixes
- No secrets, API keys, or credentials committed (check your diff!)
- No unrelated formatting/reformatting mixed into a functional change

## Reporting bugs / requesting features

Please use the issue templates provided — they help us triage faster.
**Do not** open a public issue for security vulnerabilities — see
[SECURITY.md](./SECURITY.md) instead.

## Code of Conduct

By participating, you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).
