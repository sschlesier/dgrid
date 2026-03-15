import { expect } from 'expect-webdriverio';
import {
  createConnection,
  deleteConnectionFromDialog,
  editConnectionName,
  resetApp,
  s,
} from '../helpers.mjs';
import { readRuntimeInfo } from '../runtime.mjs';

describe('Connection Edit and Delete', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await resetApp();
  });

  it('edits a saved connection name', async () => {
    await createConnection({
      name: 'OldName',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await editConnectionName('OldName', 'NewName');

    await expect(s.sidebar.treeItem('NewName')).toBeDisplayed();
    await expect(s.sidebar.treeItem('OldName')).not.toExist();
  });

  it('deletes a saved connection', async () => {
    await createConnection({
      name: 'ToDelete',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await expect(s.sidebar.treeItem('ToDelete')).toBeDisplayed();
    await (await s.sidebar.actionButton('Edit connection')).click();
    await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });
    await deleteConnectionFromDialog();
    await s.connectionDialog.overlay().waitForDisplayed({ reverse: true, timeout: 10_000 });

    await expect(s.sidebar.treeItem('ToDelete')).not.toExist();
    await expect(s.sidebar.emptyState()).toBeDisplayed();
  });

  it('shows the edit connection heading in the dialog', async () => {
    await createConnection({
      name: 'TestConn',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await (await s.sidebar.actionButton('Edit connection')).click();
    await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });

    await expect(s.connectionDialog.heading()).toHaveText('Edit Connection');
  });
});
