---
name: release
description: Prepare and publish a new release — collect changes, update CHANGES.md, bump version, push to GitHub.
user_invocable: true
---

# Release Workflow

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

## 4. Review CHANGES.md

Show the user the full diff of CHANGES.md so they can review the exact text. Ask for feedback using `AskUserQuestion` with these options:

- **Looks good** — proceed to version bump
- **Edit** — the user wants to revise the wording (they'll provide feedback via "Other")

If the user provides edits, apply them to CHANGES.md and show the updated diff again. Repeat until the user approves.

## 5. Bump Version

First, commit the CHANGES.md update so the working tree is clean before `pnpm version` runs:

```bash
git add CHANGES.md
git commit -m "chore: update CHANGES.md for v<new-version>"
```

Then run `pnpm version` with the confirmed increment. This updates `package.json`, commits, and creates the `v*` tag:

```bash
pnpm version <patch|minor|major>
```

## 6. Push to GitHub

Push the commit and tag to trigger the release workflow:

```bash
git push origin main && git push origin v<new-version>
```

## Error Handling

- If the working tree is dirty before starting, warn the user and stop.
- If `pnpm version` fails, investigate and report the error — do not retry blindly.
- If `git push` fails, report the error and let the user decide how to proceed.
