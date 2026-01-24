---
name: verify-changes
description: Complete verification workflow for code quality and correctness. Run after implementing any feature.
---

# Verification Workflow

Run these checks in order. Stop if any check fails.

## 1. Type Safety

```bash
pnpm type-check
```

- If errors: Use type-checker sub-agent to fix
- Requirement: Zero TypeScript errors

## 2. Code Quality

```bash
pnpm lint
```

- Auto-fix: `pnpm lint --fix`
- Requirement: Zero linting errors

## 3. Tests

```bash
pnpm test
```

- If failures: Use test-runner sub-agent to debug
- Requirement: All tests passing

## 4. Build

```bash
pnpm build
```

- Requirement: Successful build

## 5. Code Review (for significant changes)

- Use code-reviewer sub-agent
- Address critical and important issues

## Success Criteria

- Type check passes
- Linter passes
- All tests pass
- Build succeeds
- Code review complete (if needed)

Report final status:

```
VERIFICATION STATUS: [PASS/FAIL]

Type Check
Linting
Tests (X passed)
Build
Code Review

All checks passed! Ready to commit.
```
