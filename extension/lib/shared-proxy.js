'use strict';
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process'), { randomBytes, timingSafeEqual } = require('node:crypto');
const MAX = 1024 * 1024;
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
function lines(stream, receive, failed) {
  let buffer = ''; stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk; if (Buffer.byteLength(buffer) > MAX) { failed(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (line.trim()) try { receive(JSON.parse(line)); } catch { failed(); return; }
    }
  });
  stream.on('error', failed);
}
// Single native stdio connection. Native IDs and phone ownership stay in memory.
class SharedBroker {
  constructor(nativeWrite, desktopWrite) {
    this.nativeWrite = nativeWrite; this.desktop = { desktop: true, send: desktopWrite };
    this.counter = 0; this.pending = new Map(); this.requests = new Map(); this.owners = new Map();
  }
  error(client, id, message = 'Request unavailable') { client.send({ id, error: { code: -32001, message } }); }
  request(client, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Protocol');
    if (!message.method) {
      if (this.requests.get(message.id)?.client !== client) return;
      this.requests.delete(message.id); this.nativeWrite(message); return;
    }
    const thread = message.params?.threadId, owner = this.owners.get(thread);
    if (!client.desktop) {
      if (message.method === 'initialize') {
        if (client.initialized || !this.initialization) return this.error(client, message.id);
        client.initialized = true; client.send({ id: message.id, result: this.initialization }); return;
      }
      if (!client.initialized) return this.error(client, message.id);
      if (message.method === 'initialized') return;
      if (!['thread/start', 'turn/start', 'turn/interrupt'].includes(message.method)
        || (message.method === 'thread/start' && this.owners.size)
        || (message.method !== 'thread/start' && owner?.client !== client)
        || (message.method === 'turn/interrupt' && owner.turnId !== message.params.turnId)) return this.error(client, message.id);
      if (message.method === 'turn/start') {
        if (owner.turnRequested) return this.error(client, message.id);
        owner.turnRequested = true;
      }
    } else if (owner) {
      if (message.method === 'turn/interrupt' && owner.turnId !== message.params.turnId) return this.error(client, message.id);
      const filtered = filterDesktop(message, thread);
      if (!filtered) return this.error(client, message.id, 'This phone task is still running. Cancel it before continuing.');
      message = filtered;
      if (!owner.materialized && ['thread/read', 'thread/resume', 'thread/turns/list', 'thread/items/list'].includes(message.method)) {
        if (owner.held.length >= 32) return this.error(client, message.id);
        owner.held.push(message); owner.client.send({ method: 'anydevice/desktopJoined', params: { threadId: thread } }); return;
      }
    }
    if (Object.hasOwn(message, 'id')) {
      if (this.pending.size >= 256) return this.error(client, message.id);
      const id = ++this.counter; this.pending.set(id, { client, id: message.id, method: message.method, thread });
      this.nativeWrite({ ...message, id });
    } else this.nativeWrite(message);
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
      if (request.method === 'initialize' && request.client.desktop && !message.error) this.initialization = message.result;
      if (request.method === 'thread/start' && !request.client.desktop && message.result?.thread?.id && !request.client.closed)
        this.owners.set(message.result.thread.id, { client: request.client, held: [], turnRequested: false, materialized: false });
      if (request.method === 'turn/start' && message.error) {
        const owner = this.owners.get(request.thread); this.owners.delete(request.thread); if (owner) this.flush(owner);
      }
      if (!request.client.closed) request.client.send({ ...message, id: request.id }); return;
    }
    const params = message.params || {}, owner = this.owners.get(params.threadId);
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
  lines(backend.stdout, message => broker.receive(message), () => { cleanup(); process.exit(1); });
  lines(process.stdin, message => broker.request(broker.desktop, message), () => { cleanup(); process.exit(1); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  fs.writeFileSync(descriptor, JSON.stringify({ schema: 1, url: 'tcp://127.0.0.1:' + server.address().port, token, instance, spec: config.spec }), { mode: 0o600 });
}
if (require.main === module) main().catch(() => { process.stderr.write('Codex AnyDevice shared connection failed.\n'); process.exit(1); });
module.exports = { validEndpoint, filterDesktop, SharedBroker };
