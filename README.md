# DGrid

A modern MongoDB GUI for macOS.

## Install (macOS)

```bash
brew install --cask sschlesier/dgrid/dgrid
```

Or download the latest `.dmg` from [Releases](https://github.com/sschlesier/dgrid/releases).

### Gatekeeper warning (manual install only)

If you installed from the DMG directly (not Homebrew), macOS will block the app because it isn't signed with an Apple Developer ID. To open it:

- **Right-click** DGrid.app and choose **Open**, then click **Open** in the dialog. You only need to do this once.

Or from terminal:

```bash
xattr -cr /Applications/DGrid.app
```

Homebrew installs handle this automatically.

## Usage

DGrid runs as a **menu bar app** — it lives in your system tray, not the Dock. Launch it and it opens your default browser to `http://127.0.0.1:3001`.

To **quit**, click the tray icon and select **Quit**. Closing the browser tab does not stop the server.

### Browser

DGrid works in any browser, but **Chromium-based browsers** (Chrome, Edge, Arc) give you native file picker dialogs for saving/loading queries and exporting CSV. Firefox and Safari fall back to a path-based input.

### Connections

Create connections using standard MongoDB URIs, including `mongodb+srv://` for Atlas. Passwords are stored in your **OS keyring** (macOS Keychain), not on disk. If you uncheck "Save Password", you'll be prompted each time you connect.

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

### Keyboard shortcuts

Press `?` to see all shortcuts. The essentials:

| Shortcut    | Action               |
| ----------- | -------------------- |
| `Cmd+Enter` | Execute query        |
| `Alt+T`     | New tab              |
| `Alt+W`     | Close tab            |
| `Cmd+S`     | Save query to file   |
| `Cmd+O`     | Load query from file |

### Things you might not find on your own

- **Vim mode** — toggle via the `</>` button in the query toolbar. Persists across sessions.
- **Inline editing** — double-click a cell in tree view to edit values in place. Supports type changes (string, number, boolean, null, ObjectId, Date).
- **CSV export** — available for `find()` and `aggregate()` results. Streams the full result set, not just the current page.
- **Query history** — dropdown next to the execute button. Stores the last 20 queries per connection/database.
- **Update checking** — DGrid checks GitHub releases periodically and shows an update notification in the tray menu.

## Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser.

## License

MIT
