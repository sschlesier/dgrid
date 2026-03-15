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
    await (await s.header.root()).waitForDisplayed({ timeout: 15_000 });
  } catch (error) {
    const source = await browser.getPageSource().catch(() => '');
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nPage source excerpt:\n${source.slice(0, 1200)}`
    );
  }
}

export async function createConnection({ name, host, port }) {
  await (await s.header.newConnectionButton()).click();
  await (await s.connectionDialog.overlay()).waitForDisplayed({ timeout: 5_000 });
  await (await s.connectionDialog.nameInput()).setValue(name);
  await (await s.connectionDialog.hostInput()).setValue(host);
  await (await s.connectionDialog.portInput()).setValue(String(port));
  await (await s.connectionDialog.saveButton()).click();
  await (await s.connectionDialog.overlay()).waitForDisplayed({ reverse: true, timeout: 5_000 });
}

export async function createConnectionViaUri({ name, uri }) {
  await (await s.header.newConnectionButton()).click();
  await (await s.connectionDialog.overlay()).waitForDisplayed({ timeout: 5_000 });
  await (await s.connectionDialog.nameInput()).setValue(name);
  await (await s.connectionDialog.uriTab()).click();
  await (await s.connectionDialog.uriInput()).setValue(uri);
  await (await s.connectionDialog.saveButton()).click();
  await (await s.connectionDialog.overlay()).waitForDisplayed({ reverse: true, timeout: 5_000 });
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
  const chevron = await item.$('.chevron');
  await chevron.click();
  await browser.waitUntil(async () => (await item.getAttribute('aria-expanded')) === 'true', {
    timeout: 10_000,
    timeoutMsg: `Tree node ${name} did not expand`,
  });
}

export async function clearAndTypeQuery(query) {
  const editor = await s.query.editorContent();
  await editor.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await browser.keys([modifier, 'a']);
  await browser.keys(query.split(''));
}

export { s };
