import { expect } from 'expect-webdriverio';
import { createConnection, createConnectionViaUri, connectToServer, resetApp, s } from '../helpers.mjs';
import { readRuntimeInfo } from '../runtime.mjs';

describe('Connection Management', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await resetApp();
  });

  it('creates a new connection via the form tab', async () => {
    await createConnection({
      name: 'Test Mongo',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await expect(s.sidebar.treeItem('Test Mongo')).toBeDisplayed();
    await expect(s.sidebar.emptyState()).not.toBeDisplayed();
  });

  it('creates a new connection via the URI tab', async () => {
    await createConnectionViaUri({
      name: 'URI Connection',
      uri: `mongodb://${runtime.mongo.host}:${runtime.mongo.port}`,
    });

    await expect(s.sidebar.treeItem('URI Connection')).toBeDisplayed();
  });

  it('shows a successful test connection result', async () => {
    await (await s.header.newConnectionButton()).click();
    await s.connectionDialog.overlay().waitForDisplayed({ timeout: 5_000 });
    await (await s.connectionDialog.nameInput()).setValue('Test Mongo');
    await (await s.connectionDialog.hostInput()).setValue(runtime.mongo.host);
    await (await s.connectionDialog.portInput()).setValue(String(runtime.mongo.port));
    await (await s.connectionDialog.testButton()).click();
    await expect(s.connectionDialog.testResultSuccess()).toBeDisplayed();
  });

  it('connects and shows databases in the sidebar', async () => {
    await createConnection({
      name: 'Connected Mongo',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await connectToServer('Connected Mongo');
    await expect(s.sidebar.treeItem('admin')).toBeDisplayed();
  });
});
