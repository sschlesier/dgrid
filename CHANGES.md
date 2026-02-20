# Changelog

## 0.6.0

- Add multi-query execution: write multiple queries in a single editor buffer
- Add split-button execute modes: Run All (Cmd+Enter), Run Current (Cmd+Shift+Enter), Run Selected (Cmd+Alt+Enter)
- Show results for multiple queries as switchable sub-tabs with independent pagination
- Errors in one query no longer block execution of others

## 0.5.0

- Add write operations to query execution (insertOne, updateMany, deleteMany, etc.)
- Add right-click context menus to sidebar tree nodes
- Add context menu actions in results grid (copy, edit, delete document)
- Add Copy Sub-Document context menu item
- Add syntax highlighting to CodeMirror editors
- Support bracket notation and db.getCollection() in query parser
- Fix query parsing for queries with leading comments
- Fix editor selection highlight visibility in vim visual mode

## 0.4.1

- Add update-available indicator in header
- Add keyboard navigation to autocomplete popup
- Fix connection state sync when MongoDB server becomes unreachable
- Add MIT license
- Add usage instructions to README

## 0.4.0

- Add resizable editor/results splitter
- Improve sidebar tree expansion: collapse all on connect, auto-expand Collections group

## 0.3.2

- Fix crash on startup in SEA build due to keyring module loading

## 0.3.1

- Fix app not quitting properly when exiting from system tray

## 0.3.0

- Support MongoDB URI and SRV connections
- Add save password option with OS keyring storage

## 0.2.0

- Add Windows x64 build support

## 0.1.1

- Move keyboard shortcuts help to header and add `?` shortcut
- Fix Gatekeeper workaround documentation
- Fix Homebrew cask revision line stripping on new releases
