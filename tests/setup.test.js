'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SetupStore, STATE_KEY, SECRET_KEY, setupSummary, normalizeState } = require('../extension/lib/setup-model');
const { SetupController } = require('../extension/lib/setup-controller');
const { zh, en } = require('../extension/lib/strings');
const { host } = require('./helpers');
const appId = '123456789'; const senderId = 'synthetic_sender_12345'; const secret = 'synthetic-qq-secret-for-tests';

function fixture(t) {
  // Match fs.promises.realpath used by project selection, including Windows 8.3 aliases.
  const projectPath = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anydevice-setup-')));
  t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
  const instance = host('zh-cn'); const controller = new SetupController(instance.api, instance.context);
  return { ...instance, controller, project: { name: 'Synthetic <project>', path: projectPath } };
}

test('saved state excludes unknown fields and plaintext secrets', () => {
  assert.deepEqual(normalizeState({ appId, senderId, appSecret: secret, command: 'injection' }),
    { schemaVersion: 1, appId, senderId });
  assert.equal(normalizeState({ senderId: '*', appId: 'invalid' }).senderId, undefined);
});

test('changing bot invalidates the old sender and stores secrets only in SecretStorage', async () => {
  const instance = host(); const store = new SetupStore(instance.context);
  await store.saveBot(appId, secret); await store.saveSender(senderId);
  await store.saveBot('987654321', 'other-synthetic-secret');
  assert.equal(store.read().senderId, undefined);
  assert.equal(instance.secrets.get(SECRET_KEY), 'other-synthetic-secret');
  assert.doesNotMatch(JSON.stringify([...instance.data.values()]), /synthetic-secret/);
  await assert.rejects(store.saveSender('*'));
});

test('metadata persistence failure restores the previous credential', async () => {
  const instance = host(); const store = new SetupStore(instance.context); await store.saveBot(appId, secret);
  instance.context.globalState.update = async () => { throw new Error('synthetic failure'); };
  await assert.rejects(store.saveBot('987654321', 'replacement-synthetic-secret'));
  assert.equal(instance.secrets.get(SECRET_KEY), secret); assert.equal(store.read().appId, appId);
});

test('cancelled credential input preserves data and uses a password box', async (t) => {
  const f = fixture(t); await f.controller.store.saveBot(appId, secret); f.inputs.push('987654321', undefined);
  await f.controller.act('credentials'); assert.equal(f.controller.store.read().appId, appId);
  assert.equal(f.secrets.get(SECRET_KEY), secret);
  const inputs = f.calls.filter((call) => call[0] === 'input');
  assert.equal(inputs[1][1].password, true); assert.equal(inputs[1][1].value, undefined);
});

test('incomplete setup cannot preview and removed gateway actions are ignored', async (t) => {
  const f = fixture(t); await f.controller.act('preview'); await f.controller.act('copyBind');
  await f.controller.act('chooseOpenClaw');
  assert.equal(f.calls.filter((call) => ['open', 'clipboard'].includes(call[0])).length, 0);
});

test('direct setup summary keeps the secret private and reports the pending connection', async (t) => {
  const f = fixture(t); await f.controller.store.saveBot(appId, secret);
  await f.controller.store.saveSender(senderId); await f.controller.store.saveProject(f.project);
  const config = setupSummary(f.controller.store.read());
  assert.equal(config.mode, 'direct'); assert.equal(config.phoneConnection, 'pendingDevelopment');
  assert.equal(config.plannedAuthorization.allowedSenderId, senderId);
  assert.equal(config.plannedAuthorization.approvalSenderId, senderId);
  assert.equal(config.plannedAuthorization.groups, 'disabled');
  assert.doesNotMatch(JSON.stringify(config), new RegExp(secret));
  await f.controller.open(); await f.controller.refresh(); const model = f.messages.at(-1).model;
  assert.equal(model.complete, true); assert.doesNotMatch(JSON.stringify(model), new RegExp(secret));
  assert.equal(model.appId, undefined); assert.equal(model.senderId, undefined); assert.equal(model.environment, undefined);
  await f.controller.act('preview');
  const opened = f.calls.find((call) => call[0] === 'open');
  assert.ok(opened, f.controller.notice);
  assert.doesNotMatch(JSON.stringify(opened), /synthetic-qq-secret|QQBOT_CLIENT_SECRET|plugins/);
});

test('deleted project cannot produce a setup summary', async (t) => {
  const f = fixture(t); await f.controller.store.saveBot(appId, secret); await f.controller.store.saveSender(senderId);
  await f.controller.store.saveProject(f.project); fs.rmdirSync(f.project.path); await f.controller.act('preview');
  assert.equal(f.calls.filter((call) => call[0] === 'open').length, 0); assert.match(f.controller.notice, /重新选择/);
});

test('unknown actions and revoked workspace trust cannot mutate setup', async (t) => {
  const f = fixture(t); await f.controller.receive({ type: 'action', action: 'executeShell', secret });
  f.api.workspace.isTrusted = false; await f.controller.receive({ type: 'action', action: 'credentials' });
  assert.equal(f.data.size, 0); assert.equal(f.secrets.size, 0); assert.equal(f.calls.filter((call) => call[0] === 'input').length, 0);
});

test('reset requires confirmation and only removes extension-owned data', async (t) => {
  const f = fixture(t); await f.controller.store.saveBot(appId, secret); f.data.set('unrelated', { untouched: true });
  await f.controller.act('clear'); assert.equal(f.secrets.get(SECRET_KEY), secret);
  f.warnings.push(f.controller.t.clearConfirm); await f.controller.act('clear');
  assert.equal(f.secrets.has(SECRET_KEY), false); assert.deepEqual(f.data.get(STATE_KEY), { schemaVersion: 1 });
  assert.deepEqual(f.data.get('unrelated'), { untouched: true });
});

test('concurrent check is not started twice', async (t) => {
  const f = fixture(t); let count = 0; let finish;
  f.controller.check = async () => { count++; return new Promise((resolve) => { finish = resolve; }); };
  const first = f.controller.act('check'); await new Promise((resolve) => setImmediate(resolve));
  await f.controller.act('check'); assert.equal(count, 1); finish({ checked: true }); await first;
});

test('both languages cover the same interface strings', () => { assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort()); });
