'use strict';
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process'), { randomBytes, timingSafeEqual } = require('node:crypto');
const MAX = 1024 * 1024;
// The pinned official extension buffers stdio JSONL up to 256 MiB. Desktop
// history can exceed the phone transport's 1 MiB bound without being invalid.
const MAX_STDIO = Math.min(256 * 1024 * 1024, Math.floor(require('node:buffer').constants.MAX_STRING_LENGTH / 2));
const DESKTOP_READS = new Set(['thread/read', 'thread/resume', 'thread/turns/list', 'thread/items/list']);
function threadInfo(thread, cwd) {
  if (!thread || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(thread.id || '')
    || thread.cwd !== cwd || thread.ephemeral || !['idle', 'notLoaded', 'active', 'systemError'].includes(thread.status?.type)) return undefined;
  return { id: thread.id, cwd, name: String(thread.name || thread.preview || thread.id).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 100),
    status: { type: thread.status.type }, canAcceptDirectInput: thread.canAcceptDirectInput !== false };
}
function idleThread(thread) { return thread && ['idle', 'notLoaded'].includes(thread.status?.type) && thread.canAcceptDirectInput !== false; }
function validPage(page) {
  return page && (page.cursor == null || (typeof page.cursor === 'string' && page.cursor.length <= 4096))
    && Number.isSafeInteger(page.offset) && page.offset >= 0 && page.offset <= MAX_STDIO;
}
function historyPage(result, page) {
  const turn = result?.data?.[0];
  const text = (Array.isArray(turn?.items) ? turn.items : []).flatMap(item => {
    if (item.type === 'userMessage' && Array.isArray(item.content)) return ['User:\n' + item.content
      .filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')];
    if (item.type === 'agentMessage' && typeof item.text === 'string') return ['Codex:\n' + item.text];
    return [];
  }).join('\n\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  let end = Math.min(page.offset + 1400, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  const next = end < text.length ? { cursor: page.cursor, offset: end }
    : typeof result?.nextCursor === 'string' && result.nextCursor.length <= 4096 ? { cursor: result.nextCursor, offset: 0 } : null;
  return { text: text.slice(page.offset, end), next };
}
function validEndpoint(value) { return typeof value === 'string' && /^tcp:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value) && Number(value.split(':').at(-1)) <= 65535; }
function filterDesktop(message, threadId) {
  if (!threadId || message.params?.threadId !== threadId) return message;
  if (['turn/start', 'turn/steer', 'thread/rollback', 'thread/compact/start', 'thread/archive', 'thread/delete', 'thread/revert', 'thread/unsubscribe'].includes(message.method)) return undefined;
  if (message.method === 'thread/resume') {
    const params = { threadId };
    for (const key of ['excludeTurns', 'initialTurnsPage']) if (Object.hasOwn(message.params, key)) params[key] = message.params[key];
    return { ...message, params };
  }
  return message;
}
function lines(stream, receive, failed, limit = MAX) {
  let buffer = '', bytes = 0, stopped = false; stream.setEncoding('utf8');
  const fail = () => { if (stopped) return; stopped = true; buffer = ''; bytes = 0; failed(); };
  stream.on('data', chunk => {
    if (stopped) return;
    let start = 0, end;
    while ((end = chunk.indexOf('\n', start)) >= 0) {
      const part = chunk.slice(start, end);
      if (bytes + Buffer.byteLength(part) > limit) { fail(); return; }
      const line = buffer + part; buffer = ''; bytes = 0; start = end + 1;
      if (line.trim()) try { receive(JSON.parse(line)); } catch { fail(); return; }
    }
    const tail = chunk.slice(start); bytes += Buffer.byteLength(tail);
    if (bytes > limit) { fail(); return; }
    buffer += tail;
  });
  stream.on('error', fail);
}
// Single native stdio connection. Native IDs and phone ownership stay in memory.
class SharedBroker {
  constructor(nativeWrite, desktopWrite) {
    this.nativeWrite = nativeWrite; this.desktop = { desktop: true, send: desktopWrite };
    this.counter = 0; this.pending = new Map(); this.requests = new Map(); this.owners = new Map();
    this.claims = new Map(); this.running = new Map(); this.starting = new Map();
    this.desktopThreads = new Set();
  }
  error(client, id, message = 'Request unavailable', code = -32001) { if (!client.closed) client.send({ id, error: { code, message } }); }
  project(client, cwd) {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || /[\x00-\x1f\x7f]/.test(cwd) || (client.cwd && client.cwd !== cwd)) return false;
    client.cwd = cwd; return true;
  }
  forward(client, message, extra = {}) {
    if (this.pending.size >= 256) return this.error(client, message.id);
    const id = ++this.counter;
    this.pending.set(id, { client, id: message.id, method: message.method, thread: message.params?.threadId, ...extra });
    if (client.desktop && message.method === 'turn/start') this.starting.set(message.params?.threadId, (this.starting.get(message.params?.threadId) || 0) + 1);
    this.nativeWrite({ ...message, id });
  }
  request(client, message) {
    if (client.closed) return;
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Protocol');
    if (!message.method) {
      if (this.requests.get(message.id)?.client !== client) return;
      this.requests.delete(message.id); this.nativeWrite(message); return;
    }
    if (Object.hasOwn(message, 'id') && this.pending.size >= 256) return this.error(client, message.id);
    const thread = message.params?.threadId, owner = this.owners.get(thread);
    if (!client.desktop) {
      if (message.method === 'initialize') {
        if (client.initialized || !this.initialization) return this.error(client, message.id);
        client.initialized = true; client.send({ id: message.id, result: this.initialization }); return;
      }
      if (!client.initialized) return this.error(client, message.id);
      if (message.method === 'initialized') return;
      if (message.method === 'thread/list') {
        if (!this.project(client, message.params?.cwd)) return this.error(client, message.id, 'Project mismatch', -32003);
        if (message.params?.cursor != null && (typeof message.params.cursor !== 'string' || message.params.cursor.length > 4096)) return this.error(client, message.id);
        return this.forward(client, { ...message, params: { cwd: client.cwd, limit: 10, archived: false, cursor: message.params?.cursor,
          modelProviders: [], sortKey: 'updated_at', sortDirection: 'desc' } }, { kind: 'list' });
      }
      if (message.method === 'anydevice/thread/history') {
        const page = message.params?.page || { cursor: null, offset: 0 };
        if (!this.project(client, message.params?.cwd) || !validPage(page)
          || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(thread || '')) return this.error(client, message.id, 'Project mismatch', -32003);
        return this.forward(client, { id: message.id, method: 'thread/read', params: { threadId: thread, includeTurns: false } }, { kind: 'historyCheck', page });
      }
      if (message.method === 'anydevice/thread/read') {
        if (!this.project(client, message.params?.cwd)) return this.error(client, message.id, 'Project mismatch', -32003);
        return this.forward(client, { ...message, method: 'thread/read', params: { threadId: thread, includeTurns: false } }, { kind: 'read' });
      }
      if (message.method === 'thread/resume') {
        if (!client.cwd || message.params?.cwd !== client.cwd || !client.threads?.has(thread)) return this.error(client, message.id, 'Project mismatch', -32003);
        if (this.owners.size || this.claims.size || this.running.has(thread) || this.starting.has(thread)
          || [...this.pending.values()].some(request => request.client.desktop && request.thread === thread && request.method !== 'thread/read')
          || [...this.pending.values()].some(request => !request.client.desktop && request.method === 'thread/start')) return this.error(client, message.id, 'Thread is busy', -32002);
        this.claims.set(thread, client);
        return this.forward(client, { id: message.id, method: 'thread/read', params: { threadId: thread, includeTurns: false } }, { kind: 'resumeCheck', resume: message });
      }
      if (!['thread/start', 'turn/start', 'turn/interrupt'].includes(message.method)
        || (message.method === 'thread/start' && (this.owners.size || this.claims.size
          || [...this.pending.values()].some(request => !request.client.desktop && request.method === 'thread/start')))
        || (message.method !== 'thread/start' && owner?.client !== client)
        || (message.method === 'turn/interrupt' && owner.turnId !== message.params.turnId)) return this.error(client, message.id);
      if (message.method === 'thread/start' && !this.project(client, message.params?.cwd)) return this.error(client, message.id, 'Project mismatch', -32003);
      if (message.method === 'turn/start') {
        if (owner.turnRequested) return this.error(client, message.id);
        owner.turnRequested = true;
      }
    } else if (this.claims.has(thread) && !owner) {
      const filtered = filterDesktop(message, thread);
      if (!filtered) return this.error(client, message.id, 'Thread is reserved for phone continuation', -32002);
      message = filtered;
    } else if (owner) {
      if (message.method === 'turn/interrupt' && owner.turnId !== message.params.turnId) return this.error(client, message.id);
      const filtered = filterDesktop(message, thread);
      if (!filtered) return this.error(client, message.id, 'This phone task is still running. Cancel it before continuing.');
      message = filtered;
      if (DESKTOP_READS.has(message.method) && !owner.desktopJoined) {
        owner.desktopJoined = true; owner.client.send({ method: 'anydevice/desktopJoined', params: { threadId: thread } });
      }
      if (!owner.materialized && DESKTOP_READS.has(message.method)) {
        if (owner.held.length >= 32) return this.error(client, message.id);
        owner.held.push(message); return;
      }
    }
    if (Object.hasOwn(message, 'id')) this.forward(client, message);
    else this.nativeWrite(message);
  }
  flush(owner) { for (const message of owner.held.splice(0)) this.request(this.desktop, message); }
  interrupt(owner, threadId) {
    if (!owner.turnId || owner.interrupted) return;
    owner.interrupted = true; const id = ++this.counter;
    this.pending.set(id, { client: { send() {} }, id, method: 'turn/interrupt', thread: threadId });
    this.nativeWrite({ id, method: 'turn/interrupt', params: { threadId, turnId: owner.turnId } });
  }
  disconnect(client) {
    if (client.closed) return; client.closed = true;
    for (const [thread, claimant] of this.claims) if (claimant === client) this.claims.delete(thread);
    for (const [id, request] of this.requests) if (request.client === client) {
      this.nativeWrite(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(request.method)
        ? { id, result: { decision: 'decline' } } : { id, error: { code: -32601, message: 'Client disconnected' } });
      this.requests.delete(id);
    }
    for (const [threadId, owner] of this.owners) if (owner.client === client) {
      if (owner.turnRequested) this.interrupt(owner, threadId);
      else { this.owners.delete(threadId); this.flush(owner); }
    }
  }
  receive(message) {
    if (message.method && Object.hasOwn(message, 'id')) {
      const thread = message.params?.threadId || message.params?.conversationId;
      if (!thread && this.owners.size) { this.nativeWrite({ id: message.id, error: { code: -32601, message: 'Request has no thread identity' } }); return; }
      const client = this.owners.get(thread)?.client || this.desktop;
      if (client.closed) { this.nativeWrite({ id: message.id, error: { code: -32601, message: 'Client disconnected' } }); return; }
      if (this.requests.has(message.id) || this.requests.size >= 256) throw new Error('Protocol');
      this.requests.set(message.id, { client, method: message.method }); client.send(message); return;
    }
    if (Object.hasOwn(message, 'id')) {
      const request = this.pending.get(message.id); if (!request) return;
      this.pending.delete(message.id);
      if (request.client.desktop && !message.error && request.thread) {
        if (DESKTOP_READS.has(request.method)) {
          this.desktopThreads.add(request.thread);
          if (this.desktopThreads.size > 1024) this.desktopThreads.delete(this.desktopThreads.values().next().value);
        }
        if (['thread/unsubscribe', 'thread/archive', 'thread/delete'].includes(request.method)) this.desktopThreads.delete(request.thread);
      }
      if (request.client.desktop && request.method === 'turn/start') {
        const count = this.starting.get(request.thread) - 1;
        if (count > 0) this.starting.set(request.thread, count); else this.starting.delete(request.thread);
      }
      if (request.kind === 'resumeCheck') {
        if (this.claims.get(request.thread) === request.client) this.claims.delete(request.thread);
        if (request.client.closed) return;
        const info = threadInfo(message.result?.thread, request.client.cwd);
        if (message.error || !info || info.id !== request.thread || !idleThread(info) || this.running.has(request.thread) || this.starting.has(request.thread)) return this.error(request.client, request.id, 'Thread is unavailable or busy', info ? -32002 : -32003);
        this.owners.set(request.thread, { client: request.client, held: [], turnRequested: false, materialized: true });
        // Resume only by ID, with user review and stricter workspace settings.
        // Never accept arbitrary history/path, a sandbox upgrade or model overrides.
        return this.forward(request.client, { id: request.id, method: 'thread/resume', params: { threadId: request.thread,
          cwd: request.client.cwd, excludeTurns: true, approvalPolicy: 'on-request', approvalsReviewer: 'user',
          config: { 'sandbox_workspace_write.network_access': false, 'sandbox_workspace_write.writable_roots': [],
            'sandbox_workspace_write.exclude_slash_tmp': true, 'sandbox_workspace_write.exclude_tmpdir_env_var': true } } });
      }
      if (request.kind === 'historyCheck') {
        if (request.client.closed) return;
        const info = threadInfo(message.result?.thread, request.client.cwd);
        if (message.error || !info || info.id !== request.thread) return this.error(request.client, request.id, 'Project mismatch', -32003);
        return this.forward(request.client, { id: request.id, method: 'thread/turns/list', params: { threadId: request.thread,
          limit: 1, sortDirection: 'desc', itemsView: 'full', cursor: request.page.cursor } }, { kind: 'history', page: request.page });
      }
      if (request.kind === 'history' && !message.error) message = { id: message.id, result: historyPage(message.result, request.page) };
      if (request.kind === 'list' && !message.error) {
        const data = (Array.isArray(message.result?.data) ? message.result.data : []).map(thread => threadInfo(thread, request.client.cwd)).filter(Boolean).slice(0, 10);
        request.client.threads = new Set(data.map(thread => thread.id)); message = { id: message.id, result: { data,
          nextCursor: typeof message.result?.nextCursor === 'string' && message.result.nextCursor.length <= 4096 ? message.result.nextCursor : null } };
      }
      if (request.kind === 'read' && !message.error) {
        const info = threadInfo(message.result?.thread, request.client.cwd);
        if (!info || info.id !== request.thread) return this.error(request.client, request.id, 'Project mismatch', -32003);
        request.client.threads ||= new Set(); request.client.threads.add(info.id);
        message = { id: message.id, result: { thread: info } };
      }
      if (request.method === 'thread/resume' && !request.client.desktop) {
        if (message.error || request.client.closed) {
          const owner = this.owners.get(request.thread);
          if (owner?.client === request.client) { this.owners.delete(request.thread); this.flush(owner); }
        } else message = { ...message, result: { ...message.result, thread: threadInfo(message.result?.thread, request.client.cwd),
          anydeviceDesktopJoined: this.desktopThreads.has(request.thread) } };
      }
      if (request.method === 'initialize' && request.client.desktop && !message.error) this.initialization = message.result;
      if (request.method === 'thread/start' && !request.client.desktop && message.result?.thread?.id && !request.client.closed)
        this.owners.set(message.result.thread.id, { client: request.client, held: [], turnRequested: false, materialized: false });
      if (request.method === 'turn/start' && message.error && !request.client.desktop) {
        const owner = this.owners.get(request.thread);
        if (owner?.client === request.client) { this.owners.delete(request.thread); this.flush(owner); }
      }
      if (!request.client.closed) request.client.send({ ...message, id: request.id }); return;
    }
    const params = message.params || {}, owner = this.owners.get(params.threadId);
    if (message.method === 'turn/started' && typeof params.turn?.id === 'string') this.running.set(params.threadId, params.turn.id);
    if (message.method === 'turn/completed' && this.running.get(params.threadId) === params.turn?.id) this.running.delete(params.threadId);
    if (message.method === 'thread/status/changed' && params.status?.type === 'active' && !this.running.has(params.threadId)) this.running.set(params.threadId, true);
    if (message.method === 'thread/status/changed' && params.status?.type === 'idle' && this.running.get(params.threadId) === true) this.running.delete(params.threadId);
    if (message.method === 'serverRequest/resolved') this.requests.delete(params.requestId);
    if (owner && message.method === 'turn/started' && typeof params.turn?.id === 'string') {
      owner.turnId = params.turn.id; owner.materialized = true; this.flush(owner);
      if (owner.client.closed) this.interrupt(owner, params.threadId);
    }
    this.desktop.send(message); if (owner && !owner.client.closed) owner.client.send(message);
    if (owner && message.method === 'turn/completed' && params.turn?.id === owner.turnId) this.owners.delete(params.threadId);
  }
}
async function main() {
  const root = __dirname, config = JSON.parse(fs.readFileSync(path.join(root, 'launch.json'), 'utf8'));
  const args = process.argv.slice(2), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ANYDEVICE_OWNER_PID;
  if (!args.includes('app-server')) {
    const child = spawn(config.spec.file, [...config.spec.prefix, ...args], { env, stdio: 'inherit', shell: false, windowsHide: true });
    child.on('error', () => process.exit(1)); child.on('exit', code => process.exit(code ?? 1)); return;
  }
  if (args.some(arg => /^--(?:listen|ws-auth|ws-token)/.test(arg))) throw new Error('Unsupported transport');
  const owner = process.env.ANYDEVICE_OWNER_PID || String(process.ppid); if (!/^[1-9]\d{0,9}$/.test(owner)) throw new Error('Owner');
  const directory = path.join(root, 'sessions', owner); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const descriptor = path.join(directory, 'connection.json'), token = randomBytes(32).toString('base64url'), instance = randomBytes(16).toString('hex');
  const backend = spawn(config.spec.file, [...config.spec.prefix, '-c', 'allow_remote_control=false', ...args],
    { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const peers = new Set(); let stopped = false;
  const broker = new SharedBroker(message => backend.stdin.write(JSON.stringify(message) + '\n'), message => process.stdout.write(JSON.stringify(message) + '\n'));
  const server = net.createServer(socket => {
    if (peers.size >= 4) { socket.destroy(); return; }
    peers.add(socket); let authenticated = false;
    const client = { send: message => { if (!socket.destroyed && !client.closed) socket.write(JSON.stringify(message) + '\n'); } };
    const timer = setTimeout(() => socket.destroy(), 5000);
    lines(socket, message => {
      if (!authenticated) {
        if (message.type !== 'auth' || typeof message.token !== 'string' || message.token.length !== token.length
          || !timingSafeEqual(Buffer.from(message.token), Buffer.from(token)) || !broker.initialization || broker.owners.size) {
          client.send({ type: 'unavailable' }); socket.destroy(); return;
        }
        authenticated = true; clearTimeout(timer); client.send({ type: 'authenticated' }); return;
      }
      broker.request(client, message);
    }, () => socket.destroy());
    socket.on('close', () => { clearTimeout(timer); peers.delete(socket); broker.disconnect(client); });
  });
  const cleanup = () => {
    if (stopped) return; stopped = true;
    for (const socket of peers) socket.destroy(); server.close(); backend.kill();
    try { if (JSON.parse(fs.readFileSync(descriptor, 'utf8')).instance === instance) fs.unlinkSync(descriptor); } catch {}
  };
  process.on('exit', cleanup); process.on('SIGTERM', () => { cleanup(); process.exit(); });
  process.stdin.on('end', () => { cleanup(); process.exit(); }); process.stdout.on('error', () => { cleanup(); process.exit(1); });
  backend.on('error', () => { cleanup(); process.exit(1); }); backend.on('exit', () => { cleanup(); process.exit(1); });
  backend.stdin.on('error', () => { cleanup(); process.exit(1); }); backend.stderr.resume();
  lines(backend.stdout, message => broker.receive(message), () => { cleanup(); process.exit(1); }, MAX_STDIO);
  lines(process.stdin, message => broker.request(broker.desktop, message), () => { cleanup(); process.exit(1); }, MAX_STDIO);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  fs.writeFileSync(descriptor, JSON.stringify({ schema: 1, url: 'tcp://127.0.0.1:' + server.address().port, token, instance, spec: config.spec }), { mode: 0o600 });
}
if (require.main === module) main().catch(() => { process.stderr.write('Codex AnyDevice shared connection failed.\n'); process.exit(1); });
module.exports = { validEndpoint, filterDesktop, SharedBroker, lines, MAX_STDIO, threadInfo, idleThread, validPage, historyPage };
