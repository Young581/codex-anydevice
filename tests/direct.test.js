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
const { en } = require('../extension/lib/strings');
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

test('QQ refuses credential redirects, unverified WSS hosts and multiple shards', async t => {
  for (const gateway of [{ url: 'wss://synthetic.invalid/websocket/' }, { url: 'wss://api.bot.qq.com/websocket/?token=synthetic' },
    { url: 'wss://api.bot.qq.com/websocket/', shards: 2 }]) {
    const f = qqFixture(t, { fetch: async (url, options) => {
      assert.equal(options.redirect, 'error');
      return { ok: true, text: async () => JSON.stringify(url.endsWith('getAppAccessToken')
        ? { access_token: 'synthetic', expires_in: 7200 } : gateway) };
    } });
    await assert.rejects(f.qq.start(appId, 'synthetic_secret'), /qqEndpoint|qqShards/);
    assert.equal(f.qq.secret, undefined);
  }
  const f = qqFixture(t, { fetch: async (_url, options) => {
    assert.equal(options.redirect, 'error'); throw new Error('synthetic redirect rejection');
  } });
  await assert.rejects(f.qq.start(appId, 'synthetic_secret')); assert.equal(f.qq.stopped, true);
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
        approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'workspaceWrite', networkAccess: false, writableRoots: [cwd], excludeSlashTmp: true, excludeTmpdirEnvVar: true } } });
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
  assert.deepEqual(turn.params.sandboxPolicy, { type: 'workspaceWrite', writableRoots: [f.cwd], networkAccess: false, excludeSlashTmp: true, excludeTmpdirEnvVar: true });
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
  assert.deepEqual(f.writes.find(message => message.method === 'turn/start').params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  f.session.stop(); assert.equal((await done).status, 'unknown');
});

test('Codex rejects unsupported versions and effective policy mismatches before a turn', async t => {
  const incompatible = nativeFixture(t, { version: '0.1.0' });
  await assert.rejects(incompatible.session.start(incompatible.cwd), /codexUnsupported/);
  assert.equal(incompatible.spawnOptions, undefined);
  const f = nativeFixture(t, { respond(message, emit) {
    if (message.method !== 'thread/start') return;
    emit({ id: message.id, result: { thread: { id: 'synthetic' }, approvalPolicy: 'never', approvalsReviewer: 'auto_review', sandbox: { type: 'dangerFullAccess' } } }); return false;
  } });
  await f.session.start(f.cwd); assert.equal((await f.session.execute('synthetic', f.cwd)).status, 'unknown');
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
  h.warnings.push(en.connectAllow); await direct.connect({ file: '/synthetic/codex', prefix: [] });
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
  await f.direct.disconnect(); f.warnings.push(en.connectAllow); await f.direct.connect({ file: '/synthetic/codex', prefix: [] });
  await f.pair(); await f.send('/new second'); const next = f.sessions[1]; await tick();
  assert.equal(old.closed, true); assert.equal(next.closed, false); assert.equal(f.direct.session, next);
});

test('terminal QQ failure revokes pairing, marks unknown and releases ownership', async t => {
  const f = await directFixture(t); await f.pair(); await f.send('/new synthetic');
  f.qq.emit('state', 'qqDenied'); await tick(); await tick();
  assert.equal(f.direct.snapshot().paired, false); assert.equal(f.direct.snapshot().task.status, 'unknown');
  assert.equal(f.direct.status, 'qqDenied'); assert.equal(f.sessions[0].closed, true); assert.equal(f.releases, 1);
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
  await f.direct.disconnect(); f.warnings.push(en.connectAllow); await f.direct.connect({ file: '/synthetic/codex', prefix: [] });
  f.context.globalState.update = storage; rejectSave(new Error('synthetic stale save failure')); await pending;
  assert.equal(f.direct.status, 'connected'); assert.ok(f.direct.selected); assert.equal(f.direct.error, undefined);
});

test('connect reservation acquired after disconnect is released without connecting', async t => {
  const f = await directFixture(t); await f.direct.disconnect(); const reservation = deferred(); let released = 0;
  const acquiring = deferred(); f.direct.options.reserve = () => { acquiring.resolve(); return reservation.promise; }; f.warnings.push(en.connectAllow);
  const request = f.direct.connect({ file: '/synthetic/codex', prefix: [] }); await acquiring.promise;
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
  t.after(() => next.disconnect()); f.warnings.push(en.connectAllow); await next.connect({ file: '/synthetic/codex', prefix: [] });
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
