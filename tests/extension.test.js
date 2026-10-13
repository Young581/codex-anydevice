'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function host(language) {
  const commands = new Map();
  const calls = [];
  const subscriptions = [];
  const context = { extensionUri: path.join(root, 'synthetic-install'), subscriptions };
  const api = {
    env: { language },
    Uri: { joinPath: (base, ...parts) => path.join(base, ...parts) },
    commands: { registerCommand: (id, fn) => {
      commands.set(id, fn);
      return { dispose: () => commands.delete(id) };
    } },
    workspace: { openTextDocument: async (uri) => {
      calls.push(['open', uri]);
      return { uri };
    } },
    window: {
      showTextDocument: async (document) => calls.push(['show', document.uri]),
      showInformationMessage: async (message) => calls.push(['message', message])
    }
  };
  const sandbox = { module: { exports: {} }, require: (name) => {
    assert.equal(name, 'vscode', 'The scaffold must not load a runtime or network module');
    return api;
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'extension/extension.js'), 'utf8'), sandbox);
  sandbox.module.exports.activate(context);
  return { commands, calls, subscriptions, context };
}

test('every contributed command is registered, remains inert at activation and disposes', () => {
  const instance = host('en');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual([...instance.commands.keys()].sort(), manifest.contributes.commands.map((c) => c.command).sort());
  assert.deepEqual(instance.calls, []);
  for (const disposable of instance.subscriptions) disposable.dispose();
  assert.equal(instance.commands.size, 0);
});

test('research opens the bundled document under the installed extension', async () => {
  const instance = host('zh-cn');
  await instance.commands.get('codexAnyDevice.openResearch')();
  const expected = path.join(instance.context.extensionUri, 'docs', 'research.md');
  assert.deepEqual(instance.calls, [['open', expected], ['show', expected]]);
});

test('Chinese status describes the scaffold without starting remote work', async () => {
  const instance = host('zh-cn');
  await instance.commands.get('codexAnyDevice.showStatus')();
  assert.equal(instance.calls.length, 1);
  assert.match(instance.calls[0][1], /研发骨架/);
});

test('English status describes the scaffold without starting remote work', async () => {
  const instance = host('en');
  await instance.commands.get('codexAnyDevice.showStatus')();
  assert.equal(instance.calls.length, 1);
  assert.match(instance.calls[0][1], /development scaffold/);
});
