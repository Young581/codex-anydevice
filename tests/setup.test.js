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

test('identity guide opens without bot credentials or identity prompts', async (t) => {
  const f = fixture(t);
  await f.controller.act('identityGuide');
  assert.deepEqual(f.calls, [
    ['open', path.join(f.context.extensionUri, 'docs', 'qq-identity.md')],
    ['show', path.join(f.context.extensionUri, 'docs', 'qq-identity.md')],
  ]);
  assert.equal(f.data.size, 0); assert.equal(f.secrets.size, 0);
});

test('manual identity requires bot credentials and cancelling preserves the recorded identity', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.controller.store.saveSender(senderId), /botRequired/);
  await f.controller.act('identity');
  assert.equal(f.calls.filter(call => call[0] === 'input').length, 0);
  assert.equal(f.controller.notice, zh.botRequired);
  await f.controller.store.saveBot(appId, secret);
  f.inputs.push(senderId); await f.controller.act('identity');
  assert.equal(f.controller.store.read().senderId, senderId);
  f.inputs.push(undefined); await f.controller.act('identity');
  assert.equal(f.controller.store.read().senderId, senderId);
  f.secrets.delete(SECRET_KEY);
  await assert.rejects(f.controller.store.saveSender('different_synthetic_sender'), /botRequired/);
  assert.equal(f.controller.store.read().senderId, senderId);
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
  assert.equal(config.mode, 'direct'); assert.equal(config.phoneConnection, 'requiresExplicitConnectionAndPairing');
  assert.equal(config.plannedAuthorization.allowedSenderId, senderId);
  assert.equal(config.plannedAuthorization.approvalLocation, 'desktop');
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

test('CLI authentication status does not prevent saving or reviewing setup details', async (t) => {
  const f = fixture(t);
  await f.controller.store.saveBot(appId, secret);
  await f.controller.store.saveSender(senderId);
  await f.controller.store.saveProject(f.project);
  for (const login of ['signedOut', 'apiKey', 'chatgpt', 'unknown']) {
    f.controller.check = async () => ({ checked: true, codex: { found: true, login } });
    await f.controller.act('check');
    assert.equal((await f.controller.model()).complete, true);
    assert.equal((await f.controller.model()).environment.codex.login, login);
    await f.controller.act('preview');
    assert.equal(f.controller.notice, '');
  }
  assert.equal(f.calls.filter((call) => call[0] === 'open').length, 8);
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

test('cancelling remains available while another setup operation is waiting', async t => {
  const f = fixture(t); let finish;
  f.controller.check = () => new Promise(resolve => { finish = resolve; });
  const waiting = f.controller.act('check'); await new Promise(resolve => setImmediate(resolve));
  let cancelled = 0; f.controller.direct.cancel = async () => { cancelled++; };
  await f.controller.act('cancel'); assert.equal(cancelled, 1); assert.equal(f.controller.busy, true);
  finish({ checked: true }); await waiting; assert.equal(f.controller.busy, false);
});

test('both languages cover the same interface strings', () => { assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort()); });

test('remembered identity and conversation are scoped to bot and explicitly authorized project', async t => {
  const f = fixture(t), store = f.controller.store;
  const id = '11111111-1111-1111-1111-111111111111';
  await store.saveBot(appId, secret); await store.saveProject(f.project); await store.saveSender(senderId);
  assert.equal(setupSummary(store.read()).plannedAuthorization.requiresLivePairing, true);
  await assert.rejects(store.saveConversation(id), /threadMissing/);
  await store.confirmSender(senderId); await store.saveConversation(id);
  const restored = new SetupStore(f.context);
  assert.equal(restored.read().conversationId, id);
  assert.equal(setupSummary(restored.read()).plannedAuthorization.requiresLivePairing, false);
  await store.saveProject({ name: 'different', path: path.join(f.project.path, 'different') });
  assert.equal(store.read().confirmedSender, senderId);
  assert.equal(store.read().authorizedProject, undefined); assert.equal(store.read().conversationId, undefined);
  await store.authorizeProject(); await store.saveConversation(id);
  await store.saveSender(senderId); assert.equal(store.read().confirmedSender, undefined);
  await store.confirmSender(senderId); await store.saveConversation(id);
  await store.saveBot('987654321', secret);
  assert.equal(store.read().senderId, undefined); assert.equal(store.read().conversationId, undefined);
});

test('forgetting pairing is durable and invalidated queued grants cannot restore it', async t => {
  const f = fixture(t), store = f.controller.store;
  await store.saveBot(appId, secret); await store.saveProject(f.project); await store.confirmSender(senderId);
  let valid = true;
  const save = store.saveBot(appId, secret);
  const late = store.confirmSender(senderId, () => valid); valid = false;
  const forget = store.forgetPairing();
  await save; await assert.rejects(late, /configurationChanged/); await forget;
  assert.equal(new SetupStore(f.context).read().confirmedSender, undefined);
  assert.equal(store.read().senderId, senderId);
});

test('saved legacy OpenID requires explicit desktop confirmation with no QQ code', async t => {
  const f = fixture(t), store = f.controller.store;
  await store.saveBot(appId, secret); await store.saveProject(f.project); await store.saveSender(senderId);
  await f.controller.act('trustIdentity'); assert.equal(store.read().confirmedSender, undefined);
  let shown;
  f.api.window.showWarningMessage = async (message, options) => { shown = { message, options }; return zh.pairAllow; };
  await f.controller.act('trustIdentity');
  assert.ok(shown.options.modal); assert.ok(shown.options.detail.includes(senderId));
  assert.ok(shown.options.detail.includes(f.project.path));
  assert.equal(store.read().confirmedSender, senderId); assert.equal(store.read().authorizedProject, f.project.path);
  assert.equal(f.controller.direct.snapshot().pairingCode, undefined);
});

test('late legacy identity confirmation cannot override disconnect or a changed scope', async t => {
  for (const change of ['disconnect', 'identity', 'project', 'trust']) {
    const f = fixture(t), store = f.controller.store;
    await store.saveBot(appId, secret); await store.saveProject(f.project); await store.saveSender(senderId);
    let approve, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    f.api.window.showWarningMessage = () => { entered(); return new Promise(resolve => { approve = resolve; }); };
    const pending = f.controller.act('trustIdentity'); await ready;
    if (change === 'disconnect') await f.controller.act('disconnect');
    if (change === 'identity') await store.saveSender('other_synthetic_sender');
    if (change === 'project') await store.saveProject({ name: 'changed', path: path.dirname(f.project.path) });
    if (change === 'trust') f.api.workspace.isTrusted = false;
    approve(zh.pairAllow); await pending;
    assert.equal(store.read().confirmedSender, undefined, change);
  }
});

test('a second disconnect during legacy grant cleanup invalidates the confirmation', async t => {
  const f = fixture(t), store = f.controller.store;
  await store.saveBot(appId, secret); await store.saveProject(f.project); await store.saveSender(senderId);
  f.warnings.push(zh.pairAllow);
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.controller.direct.release = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const pending = f.controller.act('trustIdentity'); await ready;
  await f.controller.act('disconnect'); release(); await pending;
  assert.equal(store.read().confirmedSender, undefined);
});

test('legacy project grants migrate and multiple directories retain separate targets and revocations', async t => {
  const f = fixture(t), store = f.controller.store;
  const targetA = '11111111-1111-4111-8111-111111111111', targetB = '22222222-2222-4222-8222-222222222222';
  f.data.set(STATE_KEY, { appId, senderId, project: f.project, confirmedSender: senderId, confirmedAppId: appId,
    authorizedProject: f.project.path, conversationId: targetA });
  assert.equal(store.read().projects[0].conversationId, targetA);
  const other = { name: 'Other synthetic project', path: path.join(f.project.path, 'other') };
  await store.saveProject(other); assert.equal(store.read().authorizedProject, undefined);
  await assert.rejects(store.switchProject(other.path), /projectUnauthorized/);
  await store.authorizeProject(); await store.saveConversation(targetB);
  await store.switchProject(f.project.path); assert.equal(store.read().conversationId, targetA);
  await store.switchProject(other.path); assert.equal(store.read().conversationId, targetB);
  await store.removeProject(other.path); assert.equal(store.read().project.path, f.project.path);
  assert.equal(store.read().projects.length, 1); assert.equal(store.read().conversationId, targetA);
  await store.forgetPairing(); assert.ok(store.read().projects.every(project => !project.authorized && !project.conversationId));
  await assert.rejects(store.switchProject(f.project.path), /projectUnauthorized/);
});

test('changing bot or manual identity revokes every project grant and target', async t => {
  for (const change of ['bot', 'identity']) {
    const f = fixture(t), store = f.controller.store;
    await store.saveBot(appId, secret); await store.saveProject(f.project); await store.confirmSender(senderId);
    await store.saveProject({ name: 'second', path: path.join(f.project.path, 'second') }); await store.authorizeProject();
    if (change === 'bot') await store.saveBot('987654321', secret); else await store.saveSender(senderId);
    assert.ok(store.read().projects.every(project => !project.authorized && !project.conversationId));
    assert.equal(store.read().confirmedSender, undefined);
  }
});

test('desktop can browse an external local directory and authorization requires an exact confirmation', async t => {
  const f = fixture(t), store = f.controller.store;
  await store.saveBot(appId, secret);
  f.picks.push({ browse: true });
  f.api.window.showOpenDialog = async options => {
    assert.equal(options.canSelectFolders, true); assert.equal(options.canSelectFiles, false);
    return [{ scheme: 'file', fsPath: f.project.path }];
  };
  await f.controller.act('selectProject'); assert.equal(store.read().project.path, f.project.path);
  assert.equal(store.read().authorizedProject, undefined);
  await store.confirmSender(senderId);
  const other = { name: 'another', path: path.dirname(f.project.path) };
  await store.saveProject(other);
  await f.controller.act('authorizeProject'); assert.equal(store.read().authorizedProject, undefined);
  f.warnings.push(zh.connectAllow); await f.controller.act('authorizeProject');
  assert.equal(store.read().authorizedProject, other.path);
});

test('desktop project selection clears old results and thread links and caps saved folders', async t => {
  const f = fixture(t), store = f.controller.store;
  await store.saveProject({ name: 'old project', path: path.dirname(f.project.path) });
  f.controller.direct.output = 'Old project output'; f.controller.direct.latestThread = '11111111-1111-4111-8111-111111111111';
  f.picks.push({ project: f.project }); await f.controller.act('selectProject');
  assert.equal(f.controller.direct.output, ''); assert.equal(f.controller.direct.latestThread, undefined);
  for (let index = store.read().projects.length; index < 20; index++) await store.saveProject({ name: 'synthetic-' + index, path: path.join(f.project.path, String(index)) });
  await assert.rejects(store.saveProject({ name: 'overflow', path: path.join(f.project.path, 'overflow') }), /projectLimit/);
  assert.equal(store.read().projects.length, 20);
});
