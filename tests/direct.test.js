'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { QqClient, API } = require('../extension/lib/qq-client');
const { CodexSession, CODEX_VERSION } = require('../extension/lib/codex-session');
const { DirectController, JOURNAL_KEY, journal, reserveBot } = require('../extension/lib/direct-controller');
const { SetupStore } = require('../extension/lib/setup-model');
const { SetupController } = require('../extension/lib/setup-controller');
const { zh, en } = require('../extension/lib/strings');
const { host } = require('./helpers');
const tick = () => new Promise(done => setImmediate(done));
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'Synthetic state arrived'); await new Promise(done => setTimeout(done, 5)); }
}
const appId = '123456789'; const sender = 'synthetic_sender_001';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class Socket {
  static instances = [];
  constructor(url) { this.url = url; this.events = new EventEmitter(); this.sent = []; this.readyState = 1; Socket.instances.push(this); }
  addEventListener(name, callback) { this.events.on(name, callback); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.events.emit('close', { code: 1000 }); }
  receive(value) { this.events.emit('message', { data: typeof value === 'string' ? value : JSON.stringify(value) }); }
}
function qqFixture(t, overrides = {}) {
  const calls = []; const now = Date.now();
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const value = url.endsWith('getAppAccessToken') ? { access_token: 'synthetic_token', expires_in: '7200' }
      : url.endsWith('/gateway/bot') ? { url: 'wss://api.bot.qq.com/websocket/', shards: 1 } : { id: 'synthetic_reply' };
    return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(value) };
  };
  const qq = new QqClient({ fetch, WebSocket: Socket, now: () => now, ...overrides });
  t.after(() => qq.stop());
  return { qq, calls, now };
}
function ready(qq) {
  const socket = qq.socket;
  socket.receive({ op: 10, d: { heartbeat_interval: 30000 } });
  socket.receive({ op: 0, t: 'READY', s: 1, d: { session_id: 'synthetic_session' } });
  return socket;
}
function gatewayFixture(t, gateway) {
  return qqFixture(t, { fetch: async (url, options) => {
    assert.ok(url.startsWith(API + '/'), 'REST credentials stay on the API origin');
    assert.equal(options.redirect, 'error');
    return { ok: true, text: async () => JSON.stringify(url.endsWith('getAppAccessToken')
      ? { access_token: 'synthetic_token', expires_in: 7200 } : gateway) };
  } });
}

test('QQ uses official token, C2C intent and bounded passive replies', async t => {
  const f = qqFixture(t); await f.qq.start(appId, 'synthetic_secret'); const socket = ready(f.qq);
  assert.equal(f.calls[0].url, API + '/app/getAppAccessToken');
  assert.equal(f.calls[0].options.redirect, 'error');
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { appId, clientSecret: 'synthetic_secret' });
  assert.equal(f.calls[1].options.headers.Authorization, 'QQBot synthetic_token');
  assert.deepEqual(socket.sent[0], { op: 2, d: { token: 'QQBot synthetic_token', intents: 1 << 25, shard: [0, 1], properties: {} } });
  f.qq.heartbeat(socket, f.qq.epoch); assert.deepEqual(socket.sent.at(-1), { op: 1, d: 1 });
  socket.receive({ op: 11 }); assert.equal(f.qq.awaitingAck, false);
  const source = { id: 'synthetic_message', sender, at: f.now };
  for (let i = 0; i < 4; i++) await f.qq.reply(source, 'x'.repeat(2000));
  const reply = JSON.parse(f.calls.at(-1).options.body);
  assert.equal(reply.msg_seq, 4); assert.equal(reply.msg_id, source.id); assert.equal(reply.content.length, 1800);
  assert.equal(f.calls.at(-1).url, API + '/v2/users/' + sender + '/messages');
  await assert.rejects(f.qq.reply(source, 'fifth'), /qqReplyLimit/);
  await assert.rejects(f.qq.reply({ ...source, at: f.now - 300001 }, 'late'), /qqReplyExpired/);
});

test('QQ only admits recent outer C2C senders and plain text', async t => {
  const f = qqFixture(t); await f.qq.start(appId, 'synthetic_secret'); const socket = ready(f.qq); const received = [];
  f.qq.on('message', message => received.push(message));
  const data = { id: 'synthetic_id', timestamp: new Date(f.now).toISOString(), content: '/status', author: { user_openid: sender } };
  socket.receive({ op: 0, t: 'GROUP_AT_MESSAGE_CREATE', d: data });
  socket.receive({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { ...data, author: {}, message_reference: { author: { user_openid: sender } } } });
  socket.receive({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { ...data, timestamp: new Date(f.now - 300001).toISOString() } });
  socket.receive({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { ...data, message_type: 1 } });
  socket.receive({ op: 0, t: 'C2C_MESSAGE_CREATE', d: data });
  assert.deepEqual(received, [{ id: data.id, sender, text: '/status', at: f.now }]);
});

test('QQ resumes sequence, ignores stale fatal closes and stops after retry bound', async t => {
  const f = qqFixture(t); await f.qq.start(appId, 'synthetic_secret'); const old = ready(f.qq);
  old.receive({ op: 0, t: 'IGNORED', s: 23 }); f.qq.reconnect(old, f.qq.epoch); clearTimeout(f.qq.retry);
  await f.qq.connect(f.qq.epoch); const current = f.qq.socket;
  old.events.emit('close', { code: 4004 }); assert.equal(f.qq.stopped, false); assert.equal(f.qq.socket, current);
  current.receive({ op: 10, d: { heartbeat_interval: 30000 } });
  assert.deepEqual(current.sent[0], { op: 6, d: { token: 'QQBot synthetic_token', session_id: 'synthetic_session', seq: 23 } });
  f.qq.retries = 6; f.qq.reconnect(current, f.qq.epoch);
  assert.equal(f.qq.status, 'qqNetwork'); assert.equal(f.qq.secret, undefined);
});

test('QQ connects to the exact gateway hosts from Tencent docs and official SDK tests', async t => {
  for (const hostname of ['api.bot.qq.com', 'api.sgroup.qq.com']) {
    for (const suffix of ['/websocket', '/websocket/']) {
      const url = 'wss://' + hostname + suffix;
      const f = gatewayFixture(t, { url, shards: 1 });
      await f.qq.start(appId, 'synthetic_secret'); const socket = ready(f.qq);
      assert.equal(socket.url, url); assert.equal(f.qq.status, 'connected');
      assert.equal(socket.sent[0].d.token, 'QQBot synthetic_token');
      f.qq.stop();
    }
  }
});

test('QQ refuses credential redirects, unsafe gateway variants and multiple shards before any socket', async t => {
  const variants = [
    ['wss://synthetic.invalid/websocket/', 'qqEndpointHost'],
    ['wss://api.sgroup.qq.com.synthetic.invalid/websocket', 'qqEndpointHost'],
    ['wss://synthetic.api.sgroup.qq.com/websocket', 'qqEndpointHost'],
    ['wss://api.bot.qq.com.synthetic.invalid/websocket', 'qqEndpointHost'],
    ['wss://sandbox.api.sgroup.qq.com/websocket', 'qqEndpointHost'],
    ['wss://127.0.0.1/websocket', 'qqEndpointHost'],
    ['ws://api.sgroup.qq.com/websocket', 'qqEndpointTransport'],
    ['https://api.bot.qq.com/websocket', 'qqEndpointTransport'],
    ['wss://synthetic:private@api.sgroup.qq.com/websocket', 'qqEndpointTransport'],
    ['wss://api.bot.qq.com:8443/websocket', 'qqEndpointTransport'],
    ['wss://api.sgroup.qq.com/other', 'qqEndpointPath'],
    ['wss://api.bot.qq.com/websocket/extra', 'qqEndpointPath'],
    ['wss://api.sgroup.qq.com/%77ebsocket', 'qqEndpointPath'],
    ['wss://api.bot.qq.com/websocket/?token=synthetic', 'qqEndpointOptions'],
    ['wss://api.sgroup.qq.com/websocket?compress=true', 'qqEndpointOptions'],
    ['wss://api.sgroup.qq.com/websocket#synthetic', 'qqEndpointOptions'],
  ].map(([url, error]) => [{ url }, error]);
  variants.push([{ url: 'wss://api.sgroup.qq.com/websocket', shards: 2 }, 'qqShards']);
  for (const [gateway, error] of variants) {
    const f = gatewayFixture(t, gateway); const sockets = Socket.instances.length;
    await assert.rejects(f.qq.start(appId, 'synthetic_secret'), { message: error });
    assert.equal(Socket.instances.length, sockets, 'No WebSocket or Identify to an unsafe address');
    assert.equal(f.qq.socket, undefined); assert.equal(f.qq.token, undefined);
    assert.equal(f.qq.secret, undefined);
    assert.equal(f.qq.stopped, true);
  }
  const f = qqFixture(t, { fetch: async (_url, options) => {
    assert.equal(options.redirect, 'error'); throw new Error('synthetic redirect rejection');
  } });
  await assert.rejects(f.qq.start(appId, 'synthetic_secret')); assert.equal(f.qq.stopped, true);
});

test('setup reports only gateway rejection categories in both languages and releases the bot', async t => {
  const folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anydevice-gateway-')));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const cases = [
    ['ws://api.bot.qq.com/websocket', 'qqEndpointTransport'],
    ['wss://synthetic.invalid/websocket', 'qqEndpointHost'],
    ['wss://api.sgroup.qq.com/private-synthetic-path', 'qqEndpointPath'],
    ['wss://api.sgroup.qq.com/websocket?token=synthetic-private-value', 'qqEndpointOptions'],
  ];
  for (const [language, strings] of [['zh-cn', zh], ['en', en]]) {
    for (const [url, error] of cases) {
      const h = host(language); const f = gatewayFixture(t, { url }); let releases = 0;
      const controller = new SetupController(h.api, h.context, {
        resolveCodex: async () => ({ file: '/synthetic/codex', prefix: [] }),
        check: async () => ({ checked: true, codex: { found: true, version: CODEX_VERSION, login: 'unknown' } }),
        direct: { qq: f.qq, reserve: async () => async () => { releases++; } },
      });
      t.after(() => controller.dispose());
      await controller.store.saveBot(appId, 'synthetic_secret');
      await controller.store.saveProject({ name: 'synthetic', path: folder });
      await controller.act('connect');
      assert.equal(controller.notice, strings[error]);
      assert.deepEqual(h.calls.find(call => call[0] === 'error'), ['error', strings[error]]);
      const model = await controller.model();
      assert.equal(model.direct.status, 'disconnected'); assert.equal(model.direct.paired, false);
      assert.equal(releases, 1); assert.equal(controller.direct.selected, undefined);
      assert.doesNotMatch(JSON.stringify(model), /synthetic\.invalid|private-synthetic-path|synthetic-private-value|synthetic_secret/);
    }
  }
});

function nativeFixture(t, options = {}) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.exitCode = null; // No PID: this synthetic child must never invoke taskkill.
  const writes = []; let spawnOptions; const cwd = path.resolve('synthetic-project');
  const emit = message => child.stdout.write(JSON.stringify(message) + '\n');
  child.stdin.on('data', chunk => {
    for (const line of String(chunk).trim().split('\n')) {
      const message = JSON.parse(line); writes.push(message);
      if (options.respond?.(message, emit) === false) continue;
      if (message.method === 'initialize') emit({ id: message.id, result: { userAgent: 'synthetic' } });
      if (message.method === 'thread/start') emit({ id: message.id, result: { thread: { id: 'thread_synthetic' }, cwd,
        approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'workspaceWrite', networkAccess: false, writableRoots: [], excludeSlashTmp: true, excludeTmpdirEnvVar: true } } });
      if (message.method === 'turn/start') {
        emit({ method: 'turn/started', params: { threadId: 'thread_synthetic', turn: { id: 'turn_synthetic' } } });
        emit({ id: message.id, result: { turn: { id: 'turn_synthetic' } } });
      }
      if (message.method === 'turn/interrupt') emit({ id: message.id, result: {} });
    }
  });
  const now = options.now || Date.now;
  const session = new CodexSession({ file: '/synthetic/codex', prefix: [] }, {
    run: async () => ({ code: 0, stdout: 'codex-cli ' + (options.version || CODEX_VERSION) }),
    spawn: (_file, _args, config) => { spawnOptions = config; return child; }, now,
  });
  t.after(() => session.stop());
  const approval = (id, extra = {}, method = 'item/commandExecution/requestApproval') => emit({ id, method,
    params: { threadId: 'thread_synthetic', turnId: 'turn_synthetic', itemId: 'item_synthetic', startedAtMs: now(), command: 'synthetic-command', cwd, ...extra } });
  return { session, emit, writes, cwd, approval, get spawnOptions() { return spawnOptions; } };
}

test('Codex new task requests force user review, constrained sandbox and no model/provider override', async t => {
  const f = nativeFixture(t); await f.session.start(f.cwd);
  assert.equal(f.spawnOptions.shell, false); assert.equal(f.spawnOptions.cwd, f.cwd);
  const completion = f.session.execute('synthetic task', f.cwd); await tick();
  const thread = f.writes.find(message => message.method === 'thread/start');
  const turn = f.writes.find(message => message.method === 'turn/start');
  assert.equal(thread.params.approvalsReviewer, 'user'); assert.equal(thread.params.approvalPolicy, 'on-request');
  assert.equal(thread.params.model, undefined); assert.equal(thread.params.modelProvider, undefined);
  assert.deepEqual(thread.params.config, { 'sandbox_workspace_write.network_access': false,
    'sandbox_workspace_write.writable_roots': [], 'sandbox_workspace_write.exclude_slash_tmp': true,
    'sandbox_workspace_write.exclude_tmpdir_env_var': true });
  assert.deepEqual(turn.params, { threadId: 'thread_synthetic', input: [{ type: 'text', text: 'synthetic task' }] });
  f.emit({ method: 'item/completed', params: { threadId: 'thread_synthetic', turnId: 'turn_synthetic', item: { type: 'agentMessage', text: 'synthetic result' } } });
  f.emit({ method: 'turn/completed', params: { threadId: 'thread_synthetic', turn: { id: 'turn_synthetic', status: 'completed' } } });
  assert.equal((await completion).status, 'completed');
});

test('Codex preserves a more restrictive native read-only policy', async t => {
  const f = nativeFixture(t, { respond(message, emit) {
    if (message.method !== 'thread/start') return;
    emit({ id: message.id, result: { thread: { id: 'thread_synthetic' }, cwd: path.resolve('synthetic-project'),
      approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly', networkAccess: false } } }); return false;
  } });
  await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
  assert.deepEqual(f.writes.find(message => message.method === 'turn/start').params, {
    threadId: 'thread_synthetic', input: [{ type: 'text', text: 'synthetic' }],
  });
  f.session.stop(); assert.equal((await done).status, 'unknown');
});

test('Codex accepts explicit cwd roots while inheriting restrictive native read access', async t => {
  for (const type of ['readOnly', 'workspaceWrite']) {
    const f = nativeFixture(t, { respond(message, emit) {
      if (message.method !== 'thread/start') return;
      const cwd = message.params.cwd;
      // Current official documentation includes read restrictions beyond the legacy
      // fields in this alpha's schema. Inheritance must not replace native policy.
      const access = { type: 'restricted', includePlatformDefaults: false, readableRoots: [cwd] };
      const sandbox = type === 'readOnly' ? { type, networkAccess: false, access }
        : { type, networkAccess: false, writableRoots: [cwd], excludeSlashTmp: true,
          excludeTmpdirEnvVar: true, readOnlyAccess: access };
      emit({ id: message.id, result: { thread: { id: 'thread_synthetic' }, cwd,
        approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox } }); return false;
    } });
    const policies = []; f.session.on('policy', value => policies.push(value));
    await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
    const turn = f.writes.find(message => message.method === 'turn/start'); assert.ok(turn);
    assert.equal(Object.hasOwn(turn.params, 'sandboxPolicy'), false);
    assert.equal(Object.hasOwn(turn.params, 'cwd'), false);
    assert.equal(Object.hasOwn(turn.params, 'approvalPolicy'), false);
    assert.equal(Object.hasOwn(turn.params, 'approvalsReviewer'), false);
    assert.deepEqual(policies, [{ readOnly: type === 'readOnly' }]);
    f.emit({ method: 'turn/completed', params: { threadId: 'thread_synthetic', turn: { id: 'turn_synthetic', status: 'completed' } } });
    assert.equal((await done).status, 'completed');
  }
});

test('Codex rejects broader or unconfirmed policy even when additional roots are empty', async t => {
  const cwd = path.resolve('synthetic-project');
  const safe = { type: 'workspaceWrite', networkAccess: false, writableRoots: [], excludeSlashTmp: true, excludeTmpdirEnvVar: true };
  const invalid = [
    { cwd: path.dirname(cwd) }, { thread: { id: null } }, { approvalPolicy: 'never' }, { approvalsReviewer: 'auto_review' },
    ...[{ type: 'dangerFullAccess' }, { type: 'externalSandbox' }, { networkAccess: true }, { networkAccess: undefined },
      { excludeSlashTmp: false }, { excludeTmpdirEnvVar: false }, { writableRoots: undefined },
      { writableRoots: [path.dirname(cwd)] }, { writableRoots: [cwd, path.resolve('synthetic-other-project')] },
      { type: 'readOnly', networkAccess: true }].map(value => ({ sandbox: { ...safe, ...value } })),
  ];
  for (const override of invalid) {
    const f = nativeFixture(t, { respond(message, emit) {
      if (message.method !== 'thread/start') return;
      emit({ id: message.id, result: { thread: { id: 'thread_synthetic' }, cwd,
        approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: safe, ...override } }); return false;
    } });
    await f.session.start(f.cwd); const result = await f.session.execute('synthetic', f.cwd);
    assert.equal(result.status, 'failed'); assert.equal(result.error, 'codexPolicy'); assert.equal(result.phase, 'phaseThread');
    assert.equal(f.writes.some(message => message.method === 'turn/start'), false);
  }
});

test('Codex rejects unsupported versions and effective policy mismatches before a turn', async t => {
  const incompatible = nativeFixture(t, { version: '0.1.0' });
  await assert.rejects(incompatible.session.start(incompatible.cwd), /codexUnsupported/);
  assert.equal(incompatible.spawnOptions, undefined);
  const f = nativeFixture(t, { respond(message, emit) {
    if (message.method !== 'thread/start') return;
    emit({ id: message.id, result: { thread: { id: 'synthetic' }, approvalPolicy: 'never', approvalsReviewer: 'auto_review', sandbox: { type: 'dangerFullAccess' } } }); return false;
  } });
  await f.session.start(f.cwd); assert.equal((await f.session.execute('synthetic', f.cwd)).status, 'failed');
  assert.equal(f.session.failure, 'codexPolicy'); assert.equal(f.writes.some(message => message.method === 'turn/start'), false);
});

test('Codex approvals require exact IDs, expire, and cannot answer resolved requests', async t => {
  let now = Date.now(); const f = nativeFixture(t, { now: () => now }); await f.session.start(f.cwd);
  const done = f.session.execute('synthetic', f.cwd); await tick();
  f.approval(41); assert.equal(f.session.decide(41, 'acceptForSession'), false);
  assert.equal(f.session.decide(41, 'accept'), true); assert.equal(f.session.decide(41, 'accept'), false);
  assert.deepEqual(f.writes.at(-1), { id: 41, result: { decision: 'accept' } });
  f.approval(42); f.emit({ method: 'serverRequest/resolved', params: { threadId: 'thread_synthetic', requestId: 42 } });
  assert.equal(f.session.decide(42, 'accept'), false);
  f.approval(43); now += 120001; assert.equal(f.session.decide(43, 'accept'), true);
  assert.deepEqual(f.writes.at(-1), { id: 43, result: { decision: 'decline' } });
  f.approval(44, { threadId: 'other_thread' }); assert.equal(f.session.hasRequest(44), false);
  assert.equal(f.session.closed, false);
  f.session.stop(); assert.equal((await done).status, 'unknown');
});

test('file approval shows verified change details and rejects a missing diff', async t => {
  for (const complete of [true, false]) {
    const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
    f.emit({ method: 'item/started', params: { threadId: 'thread_synthetic', turnId: 'turn_synthetic',
      item: { type: 'fileChange', id: 'item_synthetic', changes: [{ path: path.join(f.cwd, 'synthetic.txt'),
        kind: { type: 'add' }, ...(complete ? { diff: '+synthetic' } : {}) }] } } });
    f.approval(60, {}, 'item/fileChange/requestApproval');
    if (complete) { assert.equal(f.session.hasRequest(60), true); assert.equal(f.session.decide(60, 'accept'), true); }
    else { assert.equal(f.session.closed, true); assert.equal(f.writes.at(-1).result.decision, 'decline'); }
    f.session.stop(); assert.equal((await done).status, 'unknown');
  }
});

test('unsupported native permission requests and session-wide file grants fail closed', async t => {
  for (const shape of ['permission', 'fileGrant', 'stdin']) {
    const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
    f.approval(80, shape === 'fileGrant' ? { grantRoot: f.cwd } : shape === 'stdin' ? { kind: 'writeStdin' } : {},
      shape === 'permission' ? 'item/permissions/requestApproval' : shape === 'fileGrant' ? 'item/fileChange/requestApproval' : undefined);
    assert.equal(f.session.closed, true); assert.equal((await done).status, 'unknown');
    assert.notEqual(f.writes.at(-1).result?.decision, 'accept');
  }
});

test('Codex cancellation before thread reply prevents turn creation', async t => {
  let threadRequest;
  const f = nativeFixture(t, { respond(message) { if (message.method === 'thread/start') { threadRequest = message; return false; } } });
  await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick(); await f.session.interrupt();
  f.emit({ id: threadRequest.id, result: { thread: { id: 'thread_synthetic' }, cwd: f.cwd, approvalPolicy: 'on-request',
    approvalsReviewer: 'user', sandbox: { type: 'workspaceWrite', networkAccess: false, writableRoots: [f.cwd], excludeSlashTmp: true, excludeTmpdirEnvVar: true } } });
  assert.equal((await done).status, 'cancelled'); assert.equal(f.writes.some(message => message.method === 'turn/start'), false);
});

test('Codex interrupt targets the active turn and rejects its pending approval', async t => {
  const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
  f.approval(31); await f.session.interrupt();
  assert.ok(f.writes.some(message => message.id === 31 && message.result?.decision === 'decline'));
  assert.deepEqual(f.writes.at(-1).params, { threadId: 'thread_synthetic', turnId: 'turn_synthetic' });
  f.emit({ method: 'turn/completed', params: { threadId: 'thread_synthetic', turn: { id: 'turn_synthetic', status: 'interrupted' } } });
  assert.equal((await done).status, 'cancelled');
});

test('Codex distinguishes explicit pre-turn rejection from an uncertain transport loss', async t => {
  for (const method of ['thread/start', 'turn/start']) {
    const f = nativeFixture(t, { respond(message, emit) {
      if (message.method !== method) return;
      emit({ id: message.id, error: { code: -32602, message: 'synthetic-private-server-value' } }); return false;
    } });
    await f.session.start(f.cwd); const result = await f.session.execute('synthetic', f.cwd);
    assert.equal(result.status, 'failed'); assert.equal(result.error, 'codexRequestParams');
    assert.equal(result.phase, method === 'thread/start' ? 'phaseThread' : 'phaseTurn');
    assert.doesNotMatch(JSON.stringify(result), /synthetic-private-server-value/);
    assert.equal(f.writes.some(message => message.method === 'turn/start'), method === 'turn/start');
  }
  const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
  f.emit({ method: 'error', params: { threadId: 'wrong-thread', turnId: 'turn_synthetic', willRetry: false,
    error: { message: 'private', codexErrorInfo: 'unauthorized' } } });
  f.session.child.emit('exit', 1);
  const result = await done; assert.equal(result.status, 'unknown');
  assert.equal(result.error, 'codexExited'); assert.equal(result.phase, 'phaseRunning');
});

test('Codex startup and malformed protocol failures carry a safe stage and category', async t => {
  const startup = nativeFixture(t, { respond(message) {
    if (message.method === 'initialize') return false;
  } });
  const start = startup.session.start(startup.cwd); await tick(); startup.session.child.emit('error', new Error('synthetic-private-path'));
  await assert.rejects(start, { message: 'codexSpawnFailed' });
  assert.equal(startup.session.currentPhase, 'phaseInitialize');
  const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
  f.session.child.stdout.write('synthetic-invalid-json\n');
  const result = await done; assert.equal(result.status, 'unknown');
  assert.equal(result.error, 'codexProtocol'); assert.equal(result.phase, 'phaseRunning');
});

test('Codex maps structured model failures without exposing native error bodies', async t => {
  for (const [info, expected] of [
    [{ httpConnectionFailed: { httpStatusCode: 401 } }, 'codexAuth'],
    [{ responseStreamConnectionFailed: { httpStatusCode: 403 } }, 'codexAuth'],
    [{ httpConnectionFailed: { httpStatusCode: 429 } }, 'codexLimit'],
    ['usageLimitExceeded', 'codexLimit'],
    [{ responseStreamDisconnected: { httpStatusCode: 503 } }, 'codexProvider'],
    ['sandboxError', 'codexSandbox'], ['synthetic-private-class', 'codexTaskFailed'],
  ]) {
    const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
    const error = { message: 'synthetic-private-error', additionalDetails: 'synthetic-private-address', codexErrorInfo: info };
    f.emit({ method: 'error', params: { threadId: 'thread_synthetic', turnId: 'turn_synthetic', willRetry: false, error } });
    f.emit({ method: 'turn/completed', params: { threadId: 'thread_synthetic', turn: { id: 'turn_synthetic', status: 'failed', error } } });
    const result = await done; assert.equal(result.status, 'failed'); assert.equal(result.error, expected);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-private/);
  }
});

test('a retrying native error does not turn a recovered task into a failure', async t => {
  const f = nativeFixture(t); await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
  f.emit({ method: 'error', params: { threadId: 'thread_synthetic', turnId: 'turn_synthetic', willRetry: true,
    error: { message: 'private', codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 503 } } } } });
  assert.equal(f.session.failure, undefined);
  f.emit({ method: 'turn/completed', params: { threadId: 'thread_synthetic', turn: { id: 'turn_synthetic', status: 'completed' } } });
  const result = await done; assert.equal(result.status, 'completed'); assert.equal(result.error, undefined);
});

class FakeQQ extends EventEmitter {
  constructor() { super(); this.replies = []; }
  async start() { this.emit('state', 'connected'); }
  stop() { this.emit('state', 'disconnected'); }
  async reply(message, text) { this.replies.push({ message, text }); }
}
class FakeSession extends EventEmitter {
  constructor() { super(); this.requests = new Map(); this.executions = []; this.closed = false; }
  async start() { if (this.gate) await this.gate.promise; }
  async execute(prompt, cwd) { this.executions.push({ prompt, cwd }); this.active = true; this.done = deferred(); return this.done.promise; }
  hasRequest(id) { return this.requests.has(id) && !this.closed; }
  decide(id, decision) { if (!this.hasRequest(id)) return false; this.requests.delete(id); this.decisions = [...this.decisions || [], { id, decision }]; this.emit('approvalsChanged'); return true; }
  async interrupt() { this.interrupted = true; this.finish('cancelled'); }
  finish(status, output = '') { this.active = false; this.done?.resolve({ status, output }); }
  stop() { this.closed = true; this.finish('unknown'); }
}
async function directFixture(t, overrides = {}) {
  const h = host(); const store = new SetupStore(h.context); const qq = new FakeQQ(); const sessions = [];
  const folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anydevice-direct-')));
  await store.saveBot(appId, 'synthetic_secret'); await store.saveSender(sender); await store.saveProject({ name: 'synthetic', path: folder });
  let releases = 0;
  const options = { qq, reserve: async () => async () => { releases++; }, createSession: () => { const session = new FakeSession(); sessions.push(session); return session; }, ...overrides };
  const direct = new DirectController(h.api, h.context, store, en, options);
  t.after(async () => { await direct.disconnect().catch(() => {}); fs.rmSync(folder, { recursive: true, force: true }); });
  await direct.connect({ file: '/synthetic/codex', prefix: [] });
  let counter = 0;
  const send = async (text, who = sender, id) => { qq.emit('message', { id: id || 'synthetic_' + ++counter, sender: who, text, at: (options.now || Date.now)() }); await direct.queue; await tick();
    if (text.startsWith('/new ') && direct.task && who === direct.allowed) await until(() => !direct.task || Boolean(direct.session && (direct.session.gate || direct.session.executions.length))); };
  const pair = async () => { direct.pair(); h.warnings.push(en.pairAllow); await send('/pair ' + direct.snapshot().pairingCode); };
  return { ...h, store, direct, qq, sessions, send, pair, folder, get releases() { return releases; } };
}

test('manual OpenID metadata never authorizes tasks; paired sender only and one writer', async t => {
  const f = await directFixture(t); await f.send('/new should not run'); assert.equal(f.sessions.length, 0);
  await f.pair(); assert.equal(f.direct.snapshot().paired, true);
  await f.send('/new other sender', 'other_synthetic_user'); assert.equal(f.sessions.length, 0);
  await f.send('/new synthetic prompt', sender, 'same_message'); await tick();
  assert.equal(f.sessions.length, 1); assert.equal(f.sessions[0].executions.length, 1);
  await f.send('/new duplicate', sender, 'same_message'); await f.send('/new busy');
  assert.equal(f.sessions.length, 1); assert.match(f.qq.replies.at(-1).text, /has not ended/);
  f.sessions[0].finish('completed', 'synthetic output'); await tick(); await tick();
  assert.equal(f.direct.snapshot().task.status, 'completed'); assert.equal(f.direct.output, 'synthetic output');
  const serialized = JSON.stringify(f.data.get(JOURNAL_KEY));
  assert.doesNotMatch(serialized, /synthetic prompt|synthetic output|synthetic_sender|same_message|synthetic_secret/);
});

test('pairing rejects wrong, expired and reused codes and desktop rejection', async t => {
  let now = Date.now(); const f = await directFixture(t, { now: () => now });
  f.direct.pair(); const code = f.direct.snapshot().pairingCode;
  await f.send('/pair BADCODE'); assert.equal(f.direct.snapshot().paired, false);
  f.warnings.push(undefined); await f.send('/pair ' + code); assert.equal(f.direct.snapshot().paired, false);
  f.warnings.push(en.pairAllow); await f.send('/pair ' + code); assert.equal(f.direct.snapshot().paired, false);
  f.direct.pair(); const expired = f.direct.snapshot().pairingCode; now += 300001;
  await f.send('/pair ' + expired); assert.equal(f.direct.snapshot().paired, false);
  f.direct.pair(); for (let i = 0; i < 5; i++) await f.send('/pair 00000000');
  assert.equal(f.direct.snapshot().pairingCode, undefined);
});

test('disconnect invalidates an open pairing confirmation', async t => {
  const f = await directFixture(t); f.direct.pair(); const prompt = deferred();
  f.api.window.showWarningMessage = () => prompt.promise;
  const request = f.send('/pair ' + f.direct.snapshot().pairingCode, 'replacement_synthetic_sender'); await tick();
  await f.direct.disconnect(); prompt.resolve(en.pairAllow); await request;
  assert.equal(f.store.read().senderId, sender); assert.equal(f.direct.snapshot().paired, false); assert.equal(f.releases, 1);
});

test('cancelling during native startup prevents execution', async t => {
  const gate = deferred(); const session = new FakeSession(); session.gate = gate;
  const f = await directFixture(t, { createSession: () => session }); await f.pair();
  await f.send('/new synthetic'); await f.send('/cancel'); gate.resolve(); await tick(); await tick();
  assert.equal(session.executions.length, 0); assert.equal(f.direct.snapshot().task.status, 'cancelled');
});

test('old execution cleanup cannot stop a replacement session', async t => {
  const f = await directFixture(t); await f.pair(); await f.send('/new first'); const old = f.sessions[0];
  await f.direct.disconnect(); await f.direct.connect({ file: '/synthetic/codex', prefix: [] });
  await f.pair(); await f.send('/new second'); const next = f.sessions[1]; await tick();
  assert.equal(old.closed, true); assert.equal(next.closed, false); assert.equal(f.direct.session, next);
});

test('terminal QQ failure revokes pairing, marks unknown and releases ownership', async t => {
  const f = await directFixture(t); await f.pair(); await f.send('/new synthetic');
  f.qq.emit('state', 'qqDenied'); await tick(); await tick();
  assert.equal(f.direct.snapshot().paired, false); assert.equal(f.direct.snapshot().task.status, 'unknown');
  assert.equal(f.direct.status, 'qqDenied'); assert.equal(f.sessions[0].closed, true); assert.equal(f.releases, 1);
});

test('task failure reaches QQ and the desktop, survives reload, and clears for a new task', async t => {
  const f = await directFixture(t); await f.pair(); await f.send('/new synthetic'); const session = f.sessions[0];
  session.emit('phase', 'phaseRunning'); session.failure = 'codexAuth'; session.finish('failed');
  await until(() => !f.direct.task && f.qq.replies.at(-1)?.text.includes(en.codexAuth));
  assert.equal(f.direct.snapshot().error, 'codexAuth'); assert.equal(f.direct.snapshot().phase, 'phaseRunning');
  const stored = journal(f.data.get(JOURNAL_KEY)); assert.equal(stored.last.error, 'codexAuth');
  assert.equal(stored.last.phase, 'phaseRunning');
  await f.send('/status'); assert.match(f.qq.replies.at(-1).text, /authentication/);
  await f.direct.disconnect();
  const restored = new DirectController(f.api, f.context, f.store, en, { qq: new FakeQQ() });
  assert.equal(restored.snapshot().error, 'codexAuth'); assert.equal(restored.snapshot().task.status, 'failed');
  t.after(() => restored.dispose());
  const untrusted = journal({ last: { id: stored.last.id, status: 'failed', error: 'synthetic-private-error', phase: 'synthetic-private-path' } });
  assert.equal(untrusted.last.error, undefined); assert.equal(untrusted.last.phase, undefined);
  await f.direct.connect({ file: '/synthetic/codex', prefix: [] }); await f.pair();
  await f.send('/new next'); assert.equal(f.direct.snapshot().error, undefined); assert.equal(f.direct.snapshot().phase, undefined);
});

test('late failure from an old task cannot overwrite a replacement task diagnostic', async t => {
  const f = await directFixture(t); await f.pair(); await f.send('/new old'); const old = f.sessions[0];
  old.stop = () => { old.closed = true; };
  await f.direct.disconnect(); await f.direct.connect({ file: '/synthetic/codex', prefix: [] });
  await f.pair(); await f.send('/new current'); const current = f.sessions[1];
  current.emit('phase', 'phaseTurn'); old.failure = 'codexProtocol'; old.finish('unknown'); await tick();
  assert.equal(f.direct.session, current); assert.equal(f.direct.snapshot().error, undefined);
  assert.equal(f.direct.snapshot().phase, 'phaseTurn'); assert.equal(f.direct.snapshot().task.status, 'running');
});

test('changing project or losing trust prevents a native approval answer', async t => {
  for (const change of ['project', 'trust', 'resolved']) {
    const f = await directFixture(t); await f.pair(); await f.send('/new synthetic'); const session = f.sessions[0];
    session.requests.set(99, {}); const prompt = deferred(); f.api.window.showWarningMessage = () => prompt.promise;
    const approval = f.direct.approve({ id: 99, params: { command: 'synthetic' }, expiresAt: Date.now() + 120000 }, f.direct.task, f.direct.epoch, session);
    await tick();
    if (change === 'project') await f.store.saveProject({ name: 'changed', path: path.resolve('nonexistent-synthetic') });
    if (change === 'trust') f.api.workspace.isTrusted = false;
    if (change === 'resolved') session.requests.delete(99);
    prompt.resolve(en.approveOnce); await approval;
    assert.notEqual(session.decisions?.at(-1)?.decision, 'accept');
  }
});

test('storage failure prevents execution and always releases connection ownership', async t => {
  const f = await directFixture(t); await f.pair();
  f.context.globalState.update = async () => { throw new Error('synthetic failure'); };
  await f.send('/new synthetic'); assert.equal(f.sessions.length, 0); assert.equal(f.direct.task, undefined);
  assert.equal(f.releases, 1); assert.equal(f.direct.error, 'storageFailed');
});

test('a stale queued storage error cannot disconnect a newer connection', async t => {
  const f = await directFixture(t); await f.pair(); const entered = deferred(); let rejectSave;
  const storage = f.context.globalState.update;
  f.context.globalState.update = () => { entered.resolve(); return new Promise((_resolve, reject) => { rejectSave = reject; }); };
  const pending = f.send('/status'); await entered.promise;
  await f.direct.disconnect(); await f.direct.connect({ file: '/synthetic/codex', prefix: [] });
  f.context.globalState.update = storage; rejectSave(new Error('synthetic stale save failure')); await pending;
  assert.equal(f.direct.status, 'connected'); assert.ok(f.direct.selected); assert.equal(f.direct.error, undefined);
});

test('connect reservation acquired after disconnect is released without connecting', async t => {
  const f = await directFixture(t); await f.direct.disconnect(); const reservation = deferred(); let released = 0;
  const acquiring = deferred(); f.direct.options.reserve = () => { acquiring.resolve(); return reservation.promise; }; const request = f.direct.connect({ file: '/synthetic/codex', prefix: [] }); await acquiring.promise;
  await f.direct.disconnect(); reservation.resolve(async () => { released++; }); await request;
  assert.equal(released, 1); assert.equal(f.direct.selected, undefined); assert.equal(f.direct.status, 'disconnected');
});

test('journal reload keeps replay hashes, marks interrupted work unknown, and has a bounded cutoff', async t => {
  const f = await directFixture(t); await f.pair(); await f.send('/new synthetic', sender, 'replayed_message');
  const saved = journal(f.data.get(JOURNAL_KEY)); assert.equal(saved.last.status, 'unknown'); assert.ok(saved.seen.length);
  const at = Date.now(); const entries = Array.from({ length: 514 }, (_, i) => ({ hash: i.toString(16).padStart(64, '0'), at: at + i, prompt: 'must-drop' }));
  const normalized = journal({ seen: entries, floor: 0 });
  assert.equal(normalized.seen.length, 512); assert.equal(normalized.floor, at + 1); assert.equal(normalized.seen[0].prompt, undefined);
  await f.direct.disconnect(); const qq = new FakeQQ(); const next = new DirectController(f.api, f.context, f.store, en, { qq, reserve: f.direct.options.reserve, createSession: () => { throw new Error('Replay should never execute'); } });
  t.after(() => next.disconnect()); await next.connect({ file: '/synthetic/codex', prefix: [] });
  next.pair(); f.warnings.push(en.pairAllow);
  await next.handle({ id: 'new_pair_message', sender, text: '/pair ' + next.snapshot().pairingCode, at: Date.now() });
  await next.handle({ id: 'replayed_message', sender, text: '/new synthetic', at: Date.now() });
  assert.equal(next.task, undefined); assert.equal(next.data.last.status, 'unknown');
});

test('OS reservation enforces one bot owner across controllers and releases cleanly', async t => {
  const syntheticApp = 'synthetic_reservation_' + process.pid;
  const release = await reserveBot(syntheticApp); t.after(async () => { await release().catch(() => {}); });
  await assert.rejects(reserveBot(syntheticApp), /connectionBusy/); await release();
  const again = await reserveBot(syntheticApp); await again();
});

test('setup configuration edits disconnect the direct runtime first and result viewing is explicit', async t => {
  const f = await directFixture(t); const controller = new SetupController(f.api, f.context, { direct: { qq: new FakeQQ() } });
  t.after(() => controller.dispose()); let disconnected = 0;
  controller.direct.disconnect = async () => { disconnected++; };
  await controller.act('identity'); assert.equal(disconnected, 1);
  controller.direct.output = 'synthetic result'; await controller.act('showResult');
  assert.ok(f.calls.some(call => call[0] === 'open' && call[1].content === 'synthetic result'));
});

const { SharedBroker, validEndpoint, filterDesktop } = require('../extension/lib/shared-proxy');
const { SharedIntegration, KEY: SYNC_KEY } = require('../extension/lib/shared-integration');
function brokerFixture() {
  const native = [], desktop = [], phone = [];
  const broker = new SharedBroker(message => native.push(message), message => desktop.push(message));
  const client = { send: message => phone.push(message) };
  broker.request(broker.desktop, { id: 1, method: 'initialize', params: {} });
  broker.receive({ id: native.at(-1).id, result: { userAgent: 'synthetic' } });
  broker.request(client, { id: 1, method: 'initialize', params: {} });
  const start = () => {
    broker.request(client, { id: 2, method: 'thread/start', params: {} });
    broker.receive({ id: native.at(-1).id, result: { thread: { id: 'synthetic_mobile_thread' } } });
  };
  return { broker, native, desktop, phone, client, start };
}
test('shared broker isolates colliding RPC IDs and refuses phone access to desktop threads', () => {
  const f = brokerFixture();
  f.broker.request(f.client, { id: 2, method: 'thread/start', params: {} }); const phoneId = f.native.at(-1).id;
  f.broker.request(f.broker.desktop, { id: 2, method: 'account/read', params: {} }); const desktopId = f.native.at(-1).id;
  assert.notEqual(phoneId, desktopId);
  f.broker.receive({ id: desktopId, result: { syntheticDesktop: true } });
  f.broker.receive({ id: phoneId, result: { thread: { id: 'synthetic_mobile_thread' } } });
  assert.equal(f.phone.at(-1).id, 2); assert.equal(f.desktop.at(-1).id, 2);
  assert.equal(f.phone.some(message => message.result?.syntheticDesktop), false);
  const count = f.native.length;
  for (const method of ['thread/read', 'turn/start', 'turn/interrupt']) f.broker.request(f.client, { id: 10, method, params: { threadId: 'desktop_thread', turnId: 'desktop_turn' } });
  assert.equal(f.native.length, count); assert.ok(f.phone.at(-1).error);
});
test('official reads wait for first materialization and cannot alter phone policy or start a second turn', () => {
  const f = brokerFixture(); f.start(); const count = f.native.length;
  f.broker.request(f.broker.desktop, { id: 3, method: 'thread/resume', params: { threadId: 'synthetic_mobile_thread',
    excludeTurns: true, approvalPolicy: 'never', sandbox: 'danger-full-access', model: 'other' } });
  assert.equal(f.native.length, count); assert.equal(f.phone.at(-1).method, 'anydevice/desktopJoined');
  f.broker.request(f.client, { id: 3, method: 'turn/start', params: { threadId: 'synthetic_mobile_thread', input: [] } });
  f.broker.receive({ method: 'turn/started', params: { threadId: 'synthetic_mobile_thread', turn: { id: 'mobile_turn' } } });
  assert.deepEqual(f.native.at(-1).params, { threadId: 'synthetic_mobile_thread', excludeTurns: true });
  const activeCount = f.native.length;
  f.broker.request(f.broker.desktop, { id: 4, method: 'turn/start', params: { threadId: 'synthetic_mobile_thread', input: [] } });
  f.broker.request(f.client, { id: 4, method: 'turn/start', params: { threadId: 'synthetic_mobile_thread', input: [] } });
  assert.equal(f.native.length, activeCount);
  f.broker.receive({ method: 'turn/completed', params: { threadId: 'synthetic_mobile_thread', turn: { id: 'mobile_turn', status: 'completed' } } });
  f.broker.request(f.broker.desktop, { id: 5, method: 'turn/start', params: { threadId: 'synthetic_mobile_thread', input: [] } });
  assert.equal(f.native.at(-1).method, 'turn/start');
});
test('shared approvals have one owner; a foreign frontend cannot resolve them', () => {
  const f = brokerFixture(); f.start(); const request = { id: 77, method: 'item/commandExecution/requestApproval', params: { threadId: 'synthetic_mobile_thread' } };
  f.broker.receive(request); assert.equal(f.phone.at(-1), request); assert.equal(f.desktop.includes(request), false);
  const count = f.native.length; f.broker.request(f.broker.desktop, { id: 77, result: { decision: 'accept' } });
  assert.equal(f.native.length, count); f.broker.request(f.client, { id: 77, result: { decision: 'decline' } });
  assert.deepEqual(f.native.at(-1), { id: 77, result: { decision: 'decline' } });
});
test('desktop unsubscribe cannot remove a running phone subscription and is allowed after native completion', () => {
  const f = brokerFixture(); f.start();
  const threadId = 'synthetic_mobile_thread';
  f.broker.request(f.client, { id: 3, method: 'turn/start', params: { threadId, input: [] } });
  f.broker.receive({ method: 'turn/started', params: { threadId, turn: { id: 'mobile_turn' } } });
  const count = f.native.length;
  f.broker.request(f.broker.desktop, { id: 8, method: 'thread/unsubscribe', params: { threadId } });
  assert.equal(f.native.length, count); assert.equal(f.desktop.at(-1).id, 8); assert.ok(f.desktop.at(-1).error);
  const progress = { method: 'item/agentMessage/delta', params: { threadId, turnId: 'mobile_turn', delta: 'synthetic progress' } };
  f.broker.receive(progress); assert.equal(f.phone.at(-1), progress);
  f.broker.receive({ method: 'turn/completed', params: { threadId, turn: { id: 'mobile_turn', status: 'completed' } } });
  assert.equal(f.broker.owners.size, 0);
  f.broker.request(f.broker.desktop, { id: 9, method: 'thread/unsubscribe', params: { threadId } });
  assert.equal(f.native.at(-1).method, 'thread/unsubscribe'); assert.equal(f.native.at(-1).params.threadId, threadId);
});
test('a disconnected phone is interrupted accurately even before the native turn ID arrives', () => {
  const f = brokerFixture(); f.start();
  f.broker.request(f.client, { id: 3, method: 'turn/start', params: { threadId: 'synthetic_mobile_thread', input: [] } });
  f.broker.disconnect(f.client); const count = f.native.length;
  f.broker.receive({ method: 'turn/started', params: { threadId: 'synthetic_mobile_thread', turn: { id: 'mobile_turn' } } });
  assert.equal(f.native.length, count + 1); assert.deepEqual(f.native.at(-1).params, { threadId: 'synthetic_mobile_thread', turnId: 'mobile_turn' });
  assert.equal(f.native.at(-1).method, 'turn/interrupt'); assert.equal(f.broker.owners.size, 1);
  f.broker.receive({ method: 'turn/completed', params: { threadId: 'synthetic_mobile_thread', turn: { id: 'mobile_turn', status: 'interrupted' } } });
  assert.equal(f.broker.owners.size, 0); assert.ok(f.desktop.at(-1));
});
test('only canonical loopback endpoints are accepted and unrelated desktop requests remain intact', () => {
  for (const url of ['tcp://localhost:42000', 'tcp://127.0.0.1:42000/', 'tcp://127.0.0.1:42000?token=x', 'tcp://127.0.0.1:65536', 'tcp://user@127.0.0.1:4', 'tcp://192.0.2.1:4']) assert.equal(validEndpoint(url), false);
  assert.equal(validEndpoint('tcp://127.0.0.1:42000'), true);
  const message = { method: 'turn/start', params: { threadId: 'desktop_thread' } };
  assert.equal(filterDesktop(message, 'phone_thread'), message);
});
test('connecting automatically creates a code, then one exact identity and project confirmation authorizes tasks', async t => {
  const f = await directFixture(t); assert.match(f.direct.snapshot().pairingCode, /^[A-F0-9]{8}$/);
  assert.equal(f.direct.snapshot().paired, false); assert.equal(f.warnings.length, 0);
  let shown; f.api.window.showWarningMessage = async (message, options) => { shown = { message, options }; return en.pairAllow; };
  await f.send('/pair ' + f.direct.snapshot().pairingCode);
  assert.ok(shown.options.detail.includes(sender)); assert.ok(shown.options.detail.includes(f.folder)); assert.ok(shown.options.detail.includes(en.connectDetail));
  assert.equal(f.direct.snapshot().paired, true);
});
test('official sync saves and restores the original setting and rejects a changed value', async () => {
  const h = host(); let original = '/synthetic/original'; const updates = [];
  h.api.workspace.getConfiguration = () => ({ inspect: () => ({ globalValue: original }), get: () => original,
    update: async (_key, value) => { updates.push(value); original = value; } });
  const sync = new SharedIntegration(h.api, h.context, en, { prepare: async () => '/synthetic/launcher' });
  await sync.enable({}); assert.equal(updates.length, 0);
  h.warnings.push(en.syncAllow); await sync.enable({}); assert.equal(original, '/synthetic/launcher');
  assert.equal(h.data.get(SYNC_KEY).previous, '/synthetic/original');
  original = '/synthetic/manual'; await assert.rejects(sync.disable(), /syncChanged/); assert.equal(original, '/synthetic/manual');
  original = '/synthetic/launcher'; await sync.disable(); assert.equal(original, '/synthetic/original'); assert.equal(sync.snapshot().enabled, false);
});
test('a setting changed during the confirmation cannot be overwritten by enabling sync', async () => {
  const h = host(); let value = '/synthetic/original', changed = 0;
  h.api.workspace.getConfiguration = () => ({ inspect: () => ({ globalValue: value }), update: async () => { changed++; } });
  h.api.window.showWarningMessage = async () => { value = '/synthetic/changed'; return en.syncAllow; };
  const sync = new SharedIntegration(h.api, h.context, en, { prepare: async () => '/synthetic/launcher' });
  await assert.rejects(sync.enable({}), /syncChanged/); assert.equal(changed, 0); assert.equal(h.data.get(SYNC_KEY), undefined);
});

test('cancellation while the official view is opening prevents model submission', async t => {
  const f = nativeFixture(t), gate = deferred(); f.session.options.onThread = () => gate.promise;
  await f.session.start(f.cwd); const done = f.session.execute('synthetic', f.cwd); await tick();
  await f.session.interrupt(); gate.resolve(); const result = await done;
  assert.equal(result.status, 'cancelled'); assert.equal(f.writes.some(message => message.method === 'turn/start'), false);
});

test('legacy and unidentified requests cannot escape the phone approval owner', () => {
  const f = brokerFixture(); f.start(); const before = f.desktop.length;
  const legacy = { id: 90, method: 'execCommandApproval', params: { conversationId: 'synthetic_mobile_thread' } };
  f.broker.receive(legacy); assert.equal(f.phone.at(-1), legacy); assert.equal(f.desktop.length, before);
  f.broker.receive({ id: 91, method: 'syntheticUnknownRequest', params: {} });
  assert.equal(f.desktop.length, before); assert.equal(f.native.at(-1).id, 91); assert.equal(f.native.at(-1).error.code, -32601);
});
