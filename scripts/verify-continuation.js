'use strict';

// Isolated native protocol validation. No user profiles, QQ credentials or real
// provider calls. This simulates desktop stdio; it is not a VS Code GUI test.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { CodexSession, CODEX_VERSION } = require('../extension/lib/codex-session');
const { connectTransport } = require('../extension/lib/shared-integration');
const { lines, MAX_STDIO } = require('../extension/lib/shared-proxy');

const { values } = parseArgs({ options: { codex: { type: 'string' } } });
if (!values.codex || !path.isAbsolute(values.codex)) throw new Error('Provide absolute --codex path');
const repository = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) { const result = check(); if (result) return result; await pause(25); }
  throw new Error('synthetic-timeout');
}

async function main() {
  fs.mkdirSync(path.join(repository, '.tmp'), { recursive: true });
  const base = fs.mkdtempSync(path.join(repository, '.tmp', 'continuation-'));
  for (const name of ['home', 'project', 'proxy']) fs.mkdirSync(path.join(base, name));
  const cwd = fs.realpathSync.native(path.join(base, 'project'));
  const home = path.join(base, 'home'), proxy = path.join(base, 'proxy');
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { CODEX_HOME: home, NO_COLOR: '1', ELECTRON_RUN_AS_NODE: '1',
    ANYDEVICE_OWNER_PID: String(process.pid), ANYDEVICE_SYNTHETIC_KEY: 'synthetic-continuation-key' });
  assert.ok(execFileSync(values.codex, ['--version'], { env, encoding: 'utf8', windowsHide: true, timeout: 10000 }).includes(CODEX_VERSION));
  fs.writeFileSync(path.join(cwd, 'README.md'), 'Synthetic continuation project.\n');
  let calls = 0, authenticated = 0, historyRetained = false;
  const provider = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      calls++;
      if (request.headers.authorization !== 'Bearer synthetic-continuation-key') {
        response.writeHead(401); response.end(); return;
      }
      authenticated++;
      if (calls === 2) historyRetained = body.includes('synthetic desktop context') && body.includes('synthetic phone followup');
      const id = 'resp_synthetic_' + calls;
      const text = 'Synthetic answer ' + calls;
      const item = { id: 'msg_synthetic_' + calls, type: 'message', role: 'assistant', phase: 'final_answer',
        content: [{ type: 'output_text', text, annotations: [] }] };
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const emit = event => response.write('event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n');
      emit({ type: 'response.created', response: { id, status: 'in_progress', output: [] } });
      emit({ type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } });
      emit({ type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text });
      // Third call deliberately stays active until phone cancellation.
      if (calls === 3) return;
      emit({ type: 'response.output_item.done', output_index: 0, item });
      emit({ type: 'response.completed', response: { id, status: 'completed', output: [item],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 } } } });
      response.end();
    });
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(home, 'config.toml'), ['model="synthetic-model"', 'model_provider="synthetic"',
    'allow_remote_control=false', 'sandbox_mode="read-only"', 'approval_policy="on-request"', '[analytics]', 'enabled=false',
    '[model_providers.synthetic]', 'name="Synthetic authenticated provider"',
    'base_url="http://127.0.0.1:' + provider.address().port + '/v1"', 'wire_api="responses"',
    'env_key="ANYDEVICE_SYNTHETIC_KEY"', 'request_max_retries=0', 'stream_idle_timeout_ms=100000'].join('\n'));
  const spec = { file: values.codex, prefix: [] };
  fs.copyFileSync(path.join(repository, 'extension/lib/shared-proxy.js'), path.join(proxy, 'shared-proxy.js'));
  fs.writeFileSync(path.join(proxy, 'launch.json'), JSON.stringify({ spec }));
  const backend = spawn(process.execPath, [path.join(proxy, 'shared-proxy.js'), 'app-server'],
    { env, cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
  backend.stderr.resume();
  let counter = 0, protocolFailed = false;
  const pending = new Map(), events = [], sessions = [];
  lines(backend.stdout, message => {
    if (Object.hasOwn(message, 'id') && !message.method) {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error('desktop-rpc-' + message.error.code)); else entry.resolve(message.result);
    } else {
      events.push(message);
      if (message.method && Object.hasOwn(message, 'id')) backend.stdin.write(JSON.stringify({ id: message.id,
        error: { code: -32601, message: 'Synthetic validator does not approve requests' } }) + '\n');
    }
  }, () => { protocolFailed = true; }, MAX_STDIO);
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(new Error('desktop-timeout')); }, 25000);
    pending.set(id, { resolve, reject, timer }); backend.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  const completed = turnId => until(() => events.find(message => message.method === 'turn/completed' && message.params.turn?.id === turnId));
  try {
    await rpc('initialize', { clientInfo: { name: 'synthetic_desktop', version: '0.5.0' }, capabilities: { experimentalApi: true } });
    backend.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const descriptorPath = path.join(proxy, 'sessions', String(process.pid), 'connection.json');
    await until(() => fs.existsSync(descriptorPath));
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    const newPhone = async (project = cwd) => {
      const session = new CodexSession(spec, { env, connect: (receive, closed) => connectTransport(descriptor, receive, closed) });
      sessions.push(session); await session.start(project); return session;
    };
    const thread = (await rpc('thread/start', { cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' })).thread.id;
    const first = await rpc('turn/start', { threadId: thread, input: [{ type: 'text', text: 'synthetic desktop context' }] });
    assert.equal((await completed(first.turn.id)).params.turn.status, 'completed');
    const phone = await newPhone();
    assert.ok((await phone.listThreads(cwd)).some(item => item.id === thread));
    const result = await phone.execute('synthetic phone followup', cwd, thread);
    assert.equal(result.status, 'completed'); assert.equal(result.threadId, thread); assert.ok(historyRetained);
    const dialogue = await phone.readHistory(thread, cwd);
    assert.ok(dialogue.text.includes('synthetic phone followup')); assert.ok(dialogue.text.includes('Synthetic answer 2'));
    assert.ok(dialogue.next); const previous = await phone.readHistory(thread, cwd, dialogue.next);
    assert.ok(previous.text.includes('synthetic desktop context')); assert.ok(previous.text.includes('Synthetic answer 1'));
    const other = path.join(base, 'project-other'); fs.mkdirSync(other); const otherCwd = fs.realpathSync.native(other);
    const otherThread = (await rpc('thread/start', { cwd: otherCwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' })).thread.id;
    await assert.rejects(phone.readHistory(otherThread, cwd), /threadProject/);
    const otherPhone = await newPhone(otherCwd);
    assert.equal((await otherPhone.listThreads(otherCwd)).some(item => item.id === thread), false);
    await assert.rejects(otherPhone.readHistory(thread, otherCwd), /threadProject/); otherPhone.stop();
    assert.equal(phone.failure, undefined); phone.stop(); await pause(250);
    const cancel = await newPhone();
    const cancelled = cancel.execute('synthetic cancellable phone followup', cwd, thread);
    await until(() => calls === 3 && cancel.active?.turnId);
    await assert.rejects(rpc('turn/start', { threadId: thread, input: [{ type: 'text', text: 'must not submit' }] }));
    await cancel.interrupt(); assert.equal((await cancelled).status, 'cancelled'); cancel.stop(); await pause(250);
    const final = await rpc('turn/start', { threadId: thread, input: [{ type: 'text', text: 'synthetic desktop recovery' }] });
    assert.equal((await completed(final.turn.id)).params.turn.status, 'completed');
    await assert.rejects(connectTransport({ ...descriptor, token: 'x'.repeat(43) }, () => {}, () => {}), /syncUnavailable/);
    const history = await rpc('thread/read', { threadId: thread, includeTurns: true });
    assert.equal(history.thread.id, thread); assert.ok(history.thread.turns.length >= 4);
    assert.equal(protocolFailed, false); assert.equal(calls, 4); assert.equal(authenticated, 4);
    const resultSummary = { codex: CODEX_VERSION, originalThreadPreserved: true, contextRetained: historyRetained,
      desktopWriteDeniedWhilePhoneActive: true, cancelled: true, desktopRecovery: true, wrongTokenDenied: true,
      dialogueHistoryRead: true, olderHistoryPaged: true, crossProjectHistoryDenied: true,
      authenticatedMockCalls: authenticated, realModelCalls: 0, guiTest: false, realQQTest: false };
    fs.writeFileSync(path.join(base, 'result.json'), JSON.stringify(resultSummary, null, 2) + '\n');
    console.log(JSON.stringify(resultSummary));
  } finally {
    for (const session of sessions) session.stop();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('synthetic-cleanup')); }
    backend.stdin.end();
    await Promise.race([new Promise(resolve => backend.once('exit', resolve)), pause(2000)]);
    if (backend.exitCode === null) backend.kill();
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
  }
}
main().catch(error => { console.error(JSON.stringify({ failure: /^[\w-]+$/.test(error.message) ? error.message : 'synthetic-validation-failed' })); process.exitCode = 1; });
