# DGrid

A modern MongoDB GUI for macOS, Windows, and Linux.

## Install

### macOS (Homebrew)

```bash
brew install --cask sschlesier/dgrid/dgrid
```

Or download the latest `.dmg` from [Releases](https://github.com/sschlesier/dgrid/releases).

### Windows

Download the `.exe` installer from [Releases](https://github.com/sschlesier/dgrid/releases).

### Linux

Download the `.deb` or `.AppImage` from [Releases](https://github.com/sschlesier/dgrid/releases).

### Gatekeeper warning (macOS, manual install only)

If you installed from the DMG directly (not Homebrew), macOS will block the app because it isn't signed with an Apple Developer ID. To open it:

- **Right-click** DGrid.app and choose **Open**, then click **Open** in the dialog. You only need to do this once.

Or from terminal:

```bash
xattr -cr /Applications/DGrid.app
```

Homebrew installs handle this automatically.

## Usage

DGrid runs as a native desktop app. Launch it and you get a window for browsing databases, running queries, and managing documents.

### Connections

Create connections using standard MongoDB URIs, including `mongodb+srv://` for Atlas. Passwords are stored in your **OS keyring** (macOS Keychain, Windows Credential Manager, or Linux Secret Service), not on disk. If you uncheck "Save Password", you'll be prompted each time you connect.

Connection data lives in `~/.dgrid/connections.json` (URIs with credentials stripped).

### Query editor

The editor accepts MongoDB shell syntax:

```
db.users.find({ age: { $gt: 25 } }).sort({ name: 1 }).limit(10)
db.orders.aggregate([ { $group: { _id: "$status", count: { $sum: 1 } } } ])
db.users.distinct("email", { active: true })
db.users.countDocuments({ role: "admin" })
```

Database-level commands are also supported: `db.stats()`, `db.serverStatus()`, `db.currentOp()`, `db.runCommand({...})`, `db.createCollection("name")`, etc.

Write multiple queries separated by blank lines and use the execute dropdown to run all, run current, or run selected.

### Keyboard shortcuts

Press `?` to see all shortcuts. The essentials:

| Shortcut          | Action                        |
| ----------------- | ----------------------------- |
| `Cmd+Enter`       | Run All queries               |
| `Cmd+Shift+Enter` | Run Current query (at cursor) |
| `Cmd+T`           | New tab                       |
| `Cmd+W`           | Close tab                     |
| `Cmd+S`           | Save query to file            |
| `Cmd+O`           | Load query from file          |

### Things you might not find on your own

- **Vim mode** -- toggle via the `</>` button in the query toolbar. Persists across sessions.
- **Inline editing** -- double-click a cell in tree view to edit values in place. Supports type changes (string, number, boolean, null, ObjectId, Date).
- **CSV export** -- available for `find()` and `aggregate()` results. Exports the full result set, not just the current page.
- **Query history** -- dropdown next to the execute button. Stores the last 20 queries per connection/database.
- **Update checking** -- DGrid checks GitHub releases periodically and shows an update badge in the header.

## Build from Source

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9
- Platform dependencies:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
  - **Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), WebView2 (included in Windows 10+)

### Development

```bash
pnpm install
pnpm dev
```

This runs `tauri dev`, which starts the Vite frontend with hot-reload and compiles the Rust backend. A native app window opens automatically.

To work on just the frontend without the Tauri shell:

```bash
pnpm dev:frontend
```

### Production build

```bash
pnpm build
```

This runs `tauri build` and produces a platform-specific installer in `src-tauri/target/release/bundle/`:

| Platform | Output                                                                     |
| -------- | -------------------------------------------------------------------------- |
| macOS    | `dmg/DGrid_<version>_aarch64.dmg`                                          |
| Windows  | `nsis/DGrid_<version>_x64-setup.exe`                                       |
| Linux    | `deb/dgrid_<version>_amd64.deb`, `appimage/dgrid_<version>_amd64.AppImage` |

### Testing

```bash
# TypeScript tests (frontend + shared)
pnpm test run

# Rust tests (backend)
cd src-tauri && cargo test

# Type-check, lint, test, and build in one command
pnpm verify
```

## Release

Releases are automated via GitHub Actions. Pushing a `v*` tag builds for all three platforms and creates a GitHub release.

```bash
# 1. Update CHANGES.md with user-facing changes

# 2. Bump version (creates commit + tag)
pnpm version patch   # or minor / major

# 3. Push to trigger the release workflow
git push origin main && git push origin v<version>
```

The workflow:

1. Builds macOS (.dmg), Windows (.exe), and Linux (.deb, .AppImage) installers
2. Generates SHA256 checksums for each artifact
3. Creates a GitHub release with all artifacts attached
4. Updates the [Homebrew cask](https://github.com/sschlesier/homebrew-dgrid) with the new version and checksum

## Project Structure

```
src-tauri/          Tauri v2 Rust backend (commands, executor, storage, keyring)
src/frontend/       Svelte 5 UI (Vite build)
src/shared/         Shared TypeScript types and query parser
tests/e2e/          Playwright E2E tests
```

## License

MIT
