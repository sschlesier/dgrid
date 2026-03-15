import { expect } from 'expect-webdriverio';
import { selectors as s } from './selectors.mjs';
import { deleteAllConnections } from './runtime.mjs';

export async function resetApp() {
  await deleteAllConnections();
  await waitForAppReady();
  try {
    await browser.execute(() => window.localStorage.clear());
  } catch {
    // Some Tauri WebDriver sessions reject script execution while the webview is still settling.
  }
  try {
    await browser.refresh();
  } catch {
    await browser.reloadSession();
  }
  await waitForAppReady();
}

export async function waitForAppReady() {
  await $('body').waitForExist({ timeout: 15_000 });
  try {
    await s.header.root().waitForDisplayed({ timeout: 15_000 });
  } catch (error) {
    const source = await browser.getPageSource().catch(() => '');
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nPage source excerpt:\n${source.slice(0, 1200)}`
    );
  }
}

export async function createConnection({ name, host, port }) {
  await (await s.header.newConnectionButton()).click();
  await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });
  await (await s.connectionDialog.nameInput()).setValue(name);
  await (await s.connectionDialog.hostInput()).setValue(host);
  await (await s.connectionDialog.portInput()).setValue(String(port));
  await (await s.connectionDialog.saveButton()).click();
  await s.connectionDialog.overlay().waitForDisplayed({ reverse: true, timeout: 5_000 });
}

export async function createConnectionViaUri({ name, uri }) {
  await (await s.header.newConnectionButton()).click();
  await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });
  await (await s.connectionDialog.nameInput()).setValue(name);
  await (await s.connectionDialog.uriTab()).click();
  await (await s.connectionDialog.uriInput()).setValue(uri);
  await (await s.connectionDialog.saveButton()).click();
  await s.connectionDialog.overlay().waitForDisplayed({ reverse: true, timeout: 5_000 });
}

export async function connectToServer(connectionName) {
  const item = await s.sidebar.treeItem(connectionName);
  await item.click();
  await browser.waitUntil(async () => (await item.getAttribute('aria-expanded')) === 'true', {
    timeout: 10_000,
    timeoutMsg: `Connection ${connectionName} did not expand`,
  });
}

export async function expandTreeNode(name) {
  const item = await s.sidebar.treeItem(name);
  const currentState = await item.getAttribute('aria-expanded');
  if (currentState === 'true') {
    return;
  }
  const chevron = await item.$('.chevron');
  await chevron.click();
  await browser.waitUntil(async () => (await item.getAttribute('aria-expanded')) === 'true', {
    timeout: 10_000,
    timeoutMsg: `Tree node ${name} did not expand`,
  });
}

export async function clearAndTypeQuery(query) {
  const editor = await s.query.editorContainer();
  await browser.execute((el, nextQuery) => {
    el.__dgridTest?.setValue(nextQuery);
  }, editor, query);
}

export async function setQueryCursor(offset) {
  const editor = await s.query.editorContainer();
  await browser.execute((el, nextOffset) => {
    el.__dgridTest?.setSelection(nextOffset);
  }, editor, offset);
}

export async function contextClick(element, xOffset = 0, yOffset = 0) {
  await browser.execute(
    (el, offsetX, offsetY) => {
      const target = el;
      const rect = target.getBoundingClientRect();
      const clientX = Math.round(rect.left + rect.width / 2 + offsetX);
      const clientY = Math.round(rect.top + rect.height / 2 + offsetY);
      target.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: 2,
          buttons: 2,
          clientX,
          clientY,
        })
      );
    },
    element,
    xOffset,
    yOffset
  );
}

export async function openContextMenuFromFocusedCell(element) {
  await element.click();
  await browser.execute((el) => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  }, element);
  await s.contextMenu.menu().waitForDisplayed({ timeout: 5_000 });
}

export async function openCollection(connectionName, database, collection) {
  await connectToServer(connectionName);
  await expect(s.sidebar.treeItem(database)).toBeDisplayed();
  await expandTreeNode(database);
  await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
  await expandTreeNode('Collections');
  await expect(s.sidebar.treeItem(collection)).toBeDisplayed();
  await (await s.sidebar.treeItem(collection)).click();
}

export async function openCollectionResults({ connectionName, database, collection, query }) {
  await openCollection(connectionName, database, collection);
  await clearAndTypeQuery(query);
  await (await s.query.executeButton()).click();
  await expect(s.results.gridViewport()).toBeDisplayed();
}

export async function openQueryHistory() {
  await (await s.history.toolbarButton()).click();
  await s.history.dropdown().waitForDisplayed({ timeout: 5_000 });
}

export async function editConnectionName(currentName, nextName) {
  await expect(s.sidebar.treeItem(currentName)).toBeDisplayed();
  await (await s.sidebar.actionButton('Edit connection')).click();
  await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });
  await expect(s.connectionDialog.heading()).toHaveText('Edit Connection');
  await (await s.connectionDialog.nameInput()).clearValue();
  await (await s.connectionDialog.nameInput()).setValue(nextName);
  await (await s.connectionDialog.saveButton()).click();
  await s.connectionDialog.overlay().waitForDisplayed({ reverse: true, timeout: 5_000 });
}

export async function deleteConnectionFromDialog() {
  await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });
  await browser.execute(() => {
    window.confirm = () => true;
  });
  await (await s.connectionDialog.deleteButton()).click();
}

export async function switchResultsView(name) {
  await (await s.results.viewButton(name)).click();
}

export { s };
