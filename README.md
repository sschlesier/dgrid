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

## Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser.

## License

MIT
