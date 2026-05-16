---
name: release
description: Prepare and publish a new release — collect changes, update CHANGES.md, bump version, push to main, trigger release workflow.
user_invocable: true
---

# Release Workflow

**Plan mode override:** If plan mode is active when this skill starts, call `ExitPlanMode` immediately before doing anything else, then proceed with the steps below.

Follow these steps in order. Use `AskUserQuestion` to confirm choices before making changes.

## 1. Collect Changes

Find all commits since the last version tag. First get the latest tag, then use it to list commits:

```bash
git describe --tags --abbrev=0
```

Then use the returned tag value directly:

```bash
git log <tag>..HEAD --oneline
```

**Important:** Do not use `$()` subshell substitution — it triggers extra permission prompts. Always run the inner command first, read its output, then use the literal value in the next call.

Summarize each user-facing change as a bullet point. Omit internal-only changes (CI tweaks, refactors with no behavior change, test-only changes) unless they are significant.

## 2. Suggest Version Bump

Based on the changes, suggest a semver increment:

- **patch** — bug fixes, minor UI tweaks, internal refactors with no behavior change
- **minor** — new features, new UI capabilities, non-breaking additions
- **major** — breaking changes to data formats, config, or workflows that require user action

Present the suggested bump and the draft changelog to the user for confirmation using `AskUserQuestion`. Include these options:

- The suggested increment (marked as recommended)
- The other two increments
- Let the user pick "Other" if they want to adjust the changelog text

## 3. Update CHANGES.md

Insert a new section at the top of CHANGES.md (after the `# Changelog` heading) with the new version number and the bullet points. Match the existing format exactly:

```
## X.Y.Z

- Change description one
- Change description two
```

## 4. Bump Version

First, commit the CHANGES.md update so the working tree is clean before `pnpm version` runs:

```bash
git add CHANGES.md
git commit -m "chore: update CHANGES.md for v<new-version>"
```

Then run `pnpm version` with the confirmed increment. This updates `package.json`, commits, and creates the `v*` tag:

```bash
pnpm version <patch|minor|major>
```

Delete the local tag — the release workflow creates it on `main`:

```bash
git tag -d v<new-version>
```

## 5. Push to main

Push the current branch directly to `main`:

```bash
git push origin HEAD:main
```

If the current branch is not based on `main` (e.g. a feature branch), verify that all commits since the last tag are included before pushing.

## 6. Trigger the Release Workflow

```bash
gh workflow run release.yml --ref main
```

The workflow reads the version from `package.json`, creates the `v*` tag on `main`, builds all platform releases, creates the GitHub release, and updates the Homebrew cask.

Monitor progress with:

```bash
gh run list --workflow=release.yml --limit 3
```

## Error Handling

- If the working tree is dirty before starting, warn the user and stop.
- If `pnpm version` fails, investigate and report the error — do not retry blindly.
- If `git push origin HEAD:main` is rejected, report the error — do not force-push.
