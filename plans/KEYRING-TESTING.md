# Keyring / Password Storage Testing

## Problem

All password storage tests are mocked. The unit tests (`keyring.test.ts`) inject fake `vi.fn()` implementations, and the integration tests use an in-memory `Map`. E2E tests don't exercise passwords at all — mongodb-memory-server runs without auth, so no connection ever needs a password.

This means we've never verified in an automated way that:

- The `@napi-rs/keyring` native module actually loads
- set/get/delete work against the real OS credential store
- Passwords survive a backend restart (E2E round-trip)
- The SEA (single executable) native module loading path works

## Current Architecture

`createPasswordStorage(serviceName)` in `src/backend/storage/keyring.ts` already accepts a custom service name, which makes test isolation straightforward. Tests can use a dedicated name like `dgrid-test-keyring` and clean up after themselves.

## Plan

### Phase 1: Gated Integration Smoke Test

A small test file (`src/backend/__tests__/keyring-real.test.ts`) that:

1. Skips unless `TEST_KEYRING=1` is set
2. Creates a storage instance with service name `dgrid-test-keyring`
3. Runs a set/get/delete cycle with a random connection ID
4. Verifies get returns the stored value, and returns undefined after delete
5. Cleans up in `afterAll` (delete the entry) as a safety net

This catches native module loading failures and API mismatches after dependency upgrades. It's ~20 lines of real test code.

**Run locally with:** `TEST_KEYRING=1 pnpm test src/backend/__tests__/keyring-real.test.ts`

CI skips it — the env var isn't set.

### Phase 2: E2E Tests with Authenticated MongoDB

mongodb-memory-server supports starting with authentication enabled. This would let E2E tests exercise the full password round-trip:

1. Configure mongodb-memory-server with `--auth` and a root user in `global-setup.ts`
2. Add E2E tests that create a connection with username/password via the UI
3. Verify the connection succeeds (password was stored in keyring and retrieved)
4. Verify editing a connection preserves the password
5. Verify deleting a connection removes the password

This is the higher-value test — it covers what users actually do — but requires more setup work:

- Auth configuration in global-setup
- Possibly a new `mongoInfo` field for credentials
- New selectors for the password field in the connection dialog
- Still touches the real OS keychain (no way around it with `@napi-rs/keyring`)

### Not Pursuing: CI Keyring

On Linux CI, it's technically possible to run `gnome-keyring-daemon --unlock` inside a `dbus-run-session` to get an ephemeral keyring. This is fiddly, Linux-only, and doesn't cover macOS-specific behavior. Not worth the complexity unless keyring bugs become a recurring problem.

## Risks and Notes

- Both phases touch the real OS keychain. The dedicated service name (`dgrid-test-keyring`) isolates from real user data, and cleanup is deterministic.
- `@napi-rs/keyring` has no pluggable backend — it always uses the OS credential store. No file-based alternative exists.
- On macOS, Keychain Access may show a permission prompt the first time the test process accesses the keyring. After that it's silent.
