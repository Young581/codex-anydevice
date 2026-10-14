'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { host, root } = require('./helpers');

test('activation registers all commands without probing tools or reading credentials', () => {
  const instance = host('en');
  let reads = 0;
  instance.context.secrets.get = async () => { reads++; };
  instance.activate();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual([...instance.commands.keys()].sort(), manifest.contributes.commands.map((c) => c.command).sort());
  assert.deepEqual(instance.calls, []);
  assert.equal(reads, 0);
  for (const disposable of instance.context.subscriptions) disposable.dispose();
  assert.equal(instance.commands.size, 0);
});

test('research opens the bundled document under the installed extension', async () => {
  const instance = host('zh-cn');
  instance.activate();
  await instance.commands.get('codexAnyDevice.openResearch')();
  const expected = path.join(instance.context.extensionUri, 'docs', 'research.md');
  assert.deepEqual(instance.calls, [['open', expected], ['show', expected]]);
});

test('Chinese status describes configuration progress without asserting phone connectivity', async () => {
  const instance = host('zh-cn');
  instance.activate();
  await instance.commands.get('codexAnyDevice.showStatus')();
  assert.equal(instance.calls.length, 1);
  assert.doesNotMatch(instance.calls[0][1], /\d\/3/);
  assert.match(instance.calls[0][1], /未连接|disconnected/);
});

test('English status describes configuration progress without asserting phone connectivity', async () => {
  const instance = host('en');
  instance.activate();
  await instance.commands.get('codexAnyDevice.showStatus')();
  assert.equal(instance.calls.length, 1);
  assert.doesNotMatch(instance.calls[0][1], /\d\/3/);
  assert.match(instance.calls[0][1], /未连接|disconnected/);
});

test('setup reuses one webview with a restrictive CSP', async () => {
  const instance = host(); const { controller } = instance.activate();
  await instance.commands.get('codexAnyDevice.openSetup')();
  const panel = controller.panel;
  assert.match(panel.webview.html, /default-src 'none'/);
  assert.match(panel.webview.html, /script-src 'nonce-/);
  assert.doesNotMatch(panel.webview.html, /unsafe-inline/);
  await instance.commands.get('codexAnyDevice.openSetup')();
  assert.equal(controller.panel, panel);
  assert.deepEqual(instance.calls, [['reveal']]);
  panel.dispose(); assert.equal(controller.panel, undefined);
});

test('untrusted and remote contexts cannot open configuration', async () => {
  for (const mode of ['untrusted', 'remote']) {
    const instance = host(); const { controller } = instance.activate();
    if (mode === 'untrusted') instance.api.workspace.isTrusted = false;
    else instance.api.env.remoteName = 'ssh-remote';
    await controller.open(); assert.equal(controller.panel, undefined);
    assert.equal(instance.calls[0][0], 'message');
  }
});
