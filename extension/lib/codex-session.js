'use strict';

const { EventEmitter } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const { run, version } = require('./runtime');
const { threadInfo, idleThread, lines } = require('./shared-proxy');

const CODEX_VERSION = '0.162.0-alpha.17.2';
const APPROVALS = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']);
const TERMINAL = { completed: 'completed', interrupted: 'cancelled', failed: 'failed' };
const CODEX_ERRORS = Object.freeze(['codexMissing', 'codexUnsupported', 'codexUnsupportedRequest', 'codexPolicy',
  'codexVersionProbe', 'codexSpawnFailed', 'codexExited', 'codexDisconnected', 'codexTimeout', 'codexProtocol',
  'codexRequestFailed', 'codexRequestParams', 'codexAuth', 'codexLimit', 'codexProvider', 'codexSandbox', 'codexTaskFailed',
  'syncUnavailable', 'syncBusy', 'syncNotReady', 'syncVersion', 'syncRequired', 'threadBusy', 'threadMissing', 'threadProject', 'continueMissing']);
const CODEX_PHASES = Object.freeze(['phaseVersion', 'phaseInitialize', 'phaseThread', 'phaseResume', 'phaseTurn', 'phaseRunning']);
const safeFailure = value => CODEX_ERRORS.includes(value) ? value : 'codexRequestFailed';
function nativeFailure(error) {
  const info = error?.codexErrorInfo;
  if (info === 'unauthorized') return 'codexAuth';
  if (['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded'].includes(info)) return 'codexLimit';
  if (info === 'sandboxError') return 'codexSandbox';
  if (info === 'badRequest') return 'codexRequestParams';
  for (const kind of ['httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts']) {
    if (info && typeof info === 'object' && Object.hasOwn(info, kind)) {
      const status = info[kind]?.httpStatusCode;
      return [401, 403].includes(status) ? 'codexAuth' : status === 429 ? 'codexLimit' : 'codexProvider';
    }
  }
  return 'codexTaskFailed';
}

class CodexSession extends EventEmitter {
  constructor(spec, options = {}) {
    super(); this.spec = spec; this.options = options;
    this.pending = new Map(); this.requests = new Map(); this.seenRequests = new Set();
    this.counter = 0; this.closed = false;
  }
  now() { return (this.options.now || Date.now)(); }
  phase(value) { this.currentPhase = value; this.emit('phase', value); }

  async start(cwd) {
    if (!this.spec || this.closed) throw new Error('codexMissing');
    this.phase('phaseVersion');
    const probe = await (this.options.run || run)(this.spec, ['--version']);
    if (this.closed) throw new Error('codexDisconnected');
    if (!version(probe)) throw new Error('codexVersionProbe');
    if (version(probe) !== CODEX_VERSION) throw new Error('codexUnsupported');
    if (this.options.connect) {
      this.transport = await this.options.connect(message => this.receive(message), reason => this.stop(reason || 'codexDisconnected'));
      if (this.closed) { this.transport.close(); throw new Error('codexDisconnected'); }
    } else {
    try { this.child = (this.options.spawn || spawn)(this.spec.file, [...this.spec.prefix, 'app-server'], {
      cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: this.options.env || { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    }); } catch { throw new Error('codexSpawnFailed'); }
    lines(this.child.stdout, message => this.receive(message), () => this.stop('codexProtocol'));
    this.child.stderr.resume(); // Never log native stderr or credentials.
    this.child.stdin.on('error', () => this.stop('codexDisconnected'));
    this.child.stdout.on('error', () => this.stop('codexDisconnected'));
    this.child.stdout.on('end', () => this.stop('codexDisconnected'));
    this.child.on('error', () => this.stop('codexSpawnFailed')); this.child.on('exit', () => this.stop('codexExited'));
    }
    this.phase('phaseInitialize');
    await this.rpc('initialize', { clientInfo: { name: 'codex_anydevice', title: 'Codex AnyDevice', version: '0.6.0' },
      ...(this.options.historyMode === 'paginated' ? { capabilities: { experimentalApi: true } } : {}) });
    this.write({ method: 'initialized', params: {} });
    await this.options.onReady?.(this);
  }

  write(message) {
    if (!this.closed && this.transport) { this.transport.send(message); return; }
    if (this.closed || !this.child?.stdin.writable) throw new Error('codexDisconnected');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  rpc(method, params) {
    if (this.closed) return Promise.reject(new Error('codexDisconnected'));
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('codexTimeout')); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ method, id, params }); } catch (error) {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      }
    });
  }

  receive(message) {
    if (!message || typeof message !== 'object' || this.closed) return;
    const task = this.active; const params = message.params || {};
    if (this.transport && message.method === 'anydevice/desktopJoined' && params.threadId === task?.threadId) {
      task.desktopJoined = true; return;
    }
    if (message.method && Object.hasOwn(message, 'id')) {
      if (this.transport && task?.threadId && params.conversationId === task.threadId && params.threadId !== task.threadId) {
        this.write({ id: message.id, error: { code: -32601, message: 'Unsupported request' } });
        this.stop('codexUnsupportedRequest'); return;
      }
      if (this.transport && (!task?.threadId || params.threadId !== task.threadId)) return;
      const id = message.id;
      if (!(typeof id === 'string' || Number.isSafeInteger(id)) || this.seenRequests.has(id)) { this.stop('codexProtocol'); return; }
      if (this.seenRequests.size >= 4096) { this.failure = 'codexUnsupportedRequest'; this.stop(); return; }
      this.seenRequests.add(id);
      const matches = task?.threadId && task.turnId && params.threadId === task.threadId && params.turnId === task.turnId;
      const valid = matches && APPROVALS.has(message.method) && typeof params.itemId === 'string'
        && Number.isSafeInteger(params.startedAtMs) && params.startedAtMs <= this.now() + 60000;
      if (!valid) {
        this.write({ id, error: { code: -32601, message: 'Unsupported or mismatched request' } });
        if (task && params.threadId === task.threadId) { this.failure = 'codexUnsupportedRequest'; this.stop(); }
        return;
      }
      // Never grant a session-wide write root or approve terminal input with command semantics.
      const item = task.items.get(params.itemId);
      const fileDetails = item?.type === 'fileChange' && Array.isArray(item.changes) && item.changes.length > 0
        && item.changes.every(change => typeof change.path === 'string' && change.path
          && typeof change.diff === 'string' && change.diff && change.kind && typeof change.kind === 'object');
      if (task.cancelRequested || params.grantRoot || (params.kind && params.kind !== 'command')
        || (message.method === 'item/commandExecution/requestApproval' && (typeof params.command !== 'string' || !params.command.trim()))
        || (message.method === 'item/fileChange/requestApproval' && !fileDetails)) {
        this.write({ id, result: { decision: 'decline' } });
        this.failure = 'codexUnsupportedRequest'; this.stop(); return;
      }
      const expiresAt = Math.min(this.now() + 120000, params.startedAtMs + 120000);
      const entry = { message, task, expiresAt };
      this.requests.set(id, entry);
      entry.timer = setTimeout(() => this.decide(id, 'decline'), Math.max(1, expiresAt - this.now()));
      this.emit('approvalsChanged');
      if (expiresAt <= this.now()) { this.decide(id, 'decline'); return; }
      this.emit('approval', { id, method: message.method, params, item, expiresAt }); return;
    }
    if (Object.hasOwn(message, 'id')) {
      const request = this.pending.get(message.id); if (!request) return;
      clearTimeout(request.timer); this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.code === -32002 ? 'threadBusy' : message.error.code === -32003 ? 'threadProject'
          : [-32600, -32602].includes(message.error.code) ? 'codexRequestParams' : 'codexRequestFailed');
        error.requestRejected = true; request.reject(error);
      } else request.resolve(message.result);
      return;
    }
    if (!task || params.threadId !== task.threadId) return;
    if (message.method === 'serverRequest/resolved') {
      this.removeRequest(params.requestId); return;
    }
    if (message.method === 'turn/started' && !task.turnId && typeof params.turn?.id === 'string') task.turnId = params.turn.id;
    if (params.turnId === task.turnId && message.method === 'item/started' && typeof params.item?.id === 'string') {
      if (task.items.size < 256) task.items.set(params.item.id, params.item);
    }
    if (message.method === 'item/completed' && params.turnId === task.turnId && params.item?.type === 'agentMessage') {
      if (typeof params.item.text === 'string') task.output = (task.output + '\n' + params.item.text).slice(-20000);
    }
    if (message.method === 'error' && params.turnId === task.turnId && params.willRetry === false) {
      task.nativeFailure = nativeFailure(params.error);
    }
    if (message.method === 'turn/completed' && params.turn?.id === task.turnId) {
      if (params.turn.status === 'failed') this.failure = params.turn.error ? nativeFailure(params.turn.error)
        : task.nativeFailure || 'codexTaskFailed';
      this.finish(TERMINAL[params.turn.status] || 'unknown');
    }
  }

  removeRequest(id) {
    const entry = this.requests.get(id); if (!entry) return;
    clearTimeout(entry.timer); this.requests.delete(id); this.emit('approvalsChanged');
  }
  hasRequest(id) { return this.requests.has(id) && !this.closed; }
  decide(id, decision) {
    const entry = this.requests.get(id);
    if (!entry || entry.task !== this.active || entry.task.turnId !== entry.message.params.turnId || this.closed) return false;
    if (this.now() >= entry.expiresAt || entry.task.cancelRequested) decision = 'decline';
    if (!['accept', 'decline'].includes(decision)) return false;
    this.write({ id, result: { decision } }); this.removeRequest(id); return true;
  }

  async listThreads(cwd, cursor) {
    if (!this.transport) throw new Error('syncRequired');
    const result = await this.rpc('thread/list', { cwd, cursor });
    const threads = (Array.isArray(result?.data) ? result.data : []).map(thread => threadInfo(thread, cwd)).filter(Boolean).slice(0, 10)
      .map(thread => ({ ...thread, status: thread.status.type }));
    threads.nextCursor = result?.nextCursor || null; return threads;
  }
  async readHistory(threadId, cwd, page) {
    if (!this.transport) throw new Error('syncRequired');
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(threadId || '')) throw new Error('threadMissing');
    const result = await this.rpc('anydevice/thread/history', { threadId, cwd, page });
    if (typeof result?.text !== 'string' || result.text.length > 1400) throw new Error('codexProtocol');
    return result;
  }
  async checkThread(threadId, cwd) {
    if (!this.transport) throw new Error('syncRequired');
    const result = await this.rpc('anydevice/thread/read', { threadId, cwd });
    const thread = threadInfo(result?.thread, cwd);
    if (!thread || thread.id !== threadId) throw new Error('threadProject');
    if (!idleThread(thread)) throw new Error('threadBusy');
    return thread;
  }
  async execute(prompt, cwd, threadId) {
    if (this.active || this.closed) throw new Error('taskBusy');
    let resolve;
    const completion = new Promise(done => { resolve = done; });
    const task = { output: '', resolve, items: new Map() }; this.active = task;
    try {
      this.phase(threadId ? 'phaseResume' : 'phaseThread');
      if (threadId) await this.checkThread(threadId, cwd);
      if (this.active !== task || this.closed) return completion;
      if (task.cancelRequested) { this.finish('cancelled'); return completion; }
      const result = await this.rpc(threadId ? 'thread/resume' : 'thread/start', { cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user',
        ...(threadId ? { threadId, excludeTurns: true } : { sandbox: 'workspace-write' }),
        ...(!threadId && this.options.historyMode === 'paginated' ? { historyMode: 'paginated' } : {}),
        // cwd is an implicit workspace root. writable_roots lists additional roots only.
        config: { 'sandbox_workspace_write.network_access': false, 'sandbox_workspace_write.writable_roots': [],
          'sandbox_workspace_write.exclude_slash_tmp': true, 'sandbox_workspace_write.exclude_tmpdir_env_var': true } });
      if (this.active !== task) return completion;
      const readOnly = result?.sandbox?.type === 'readOnly';
      if (typeof result?.thread?.id !== 'string' || result.cwd !== cwd || result.approvalPolicy !== 'on-request'
        || result.approvalsReviewer !== 'user' || result.sandbox?.networkAccess !== false
        || (!readOnly && (result.sandbox?.type !== 'workspaceWrite' || result.sandbox.excludeSlashTmp !== true
          || result.sandbox.excludeTmpdirEnvVar !== true || !Array.isArray(result.sandbox.writableRoots)
          || result.sandbox.writableRoots.some(root => root !== cwd)))) {
        throw new Error('codexPolicy');
      }
      if (threadId && (result.thread.id !== threadId || !idleThread(result.thread))) throw new Error('threadBusy');
      task.threadId = result.thread.id;
      if (this.transport && threadId && result.anydeviceDesktopJoined === true) task.desktopJoined = true;
      this.emit('policy', { readOnly });
      await this.options.onThread?.(task.threadId, { resumed: Boolean(threadId) });
      this.emit('thread', task.threadId);
      if (this.active !== task || this.closed) return completion;
      if (task.cancelRequested) { this.finish('cancelled'); return completion; }
      this.phase('phaseTurn'); this.turnRequested = true;
      let turn;
      // Inherit the validated thread policy, including native restrictions that the
      // legacy sandbox response may not fully describe. Do not reconstruct it.
      try { turn = await this.rpc('turn/start', { threadId: task.threadId, input: [{ type: 'text', text: prompt }] });
      } catch (error) { if (error.requestRejected) task.turnRejected = true; throw error; }
      if (typeof turn?.turn?.id !== 'string') throw new Error('codexProtocol');
      if (this.active === task) {
        if (task.turnId && task.turnId !== turn.turn.id) throw new Error('codexProtocol');
        task.turnId = turn.turn.id;
        this.phase('phaseRunning');
        if (task.cancelRequested) await this.interrupt();
      }
    } catch (error) {
      this.failure = safeFailure(error.message);
      this.finish(!this.turnRequested || task.turnRejected ? 'failed' : 'unknown'); this.stop();
    }
    return completion;
  }
  async interrupt() {
    const task = this.active; if (!task) return;
    task.cancelRequested = true;
    for (const id of [...this.requests.keys()]) this.decide(id, 'decline');
    if (task.turnId && !task.interruptSent) {
      task.interruptSent = true;
      await this.rpc('turn/interrupt', { threadId: task.threadId, turnId: task.turnId });
    }
  }
  finish(status) {
    const task = this.active; if (!task) return;
    for (const entry of this.requests.values()) clearTimeout(entry.timer);
    this.requests.clear(); this.active = undefined; this.emit('approvalsChanged');
    if (status === 'completed' || status === 'cancelled') this.failure = undefined;
    task.resolve({ status, output: task.output, threadId: task.threadId, turnId: task.turnId,
      error: this.failure, phase: this.currentPhase });
  }
  stop(reason) {
    if (this.closed) return;
    // A shared backend belongs to the official extension. Only interrupt our own turn.
    if (this.transport && this.active?.threadId && this.active?.turnId) {
      try { this.write({ id: ++this.counter, method: 'turn/interrupt',
        params: { threadId: this.active.threadId, turnId: this.active.turnId } }); } catch {}
    }
    this.closed = true;
    if (reason || this.active) this.failure ||= safeFailure(reason || 'codexDisconnected');
    this.finish(this.active && !this.turnRequested ? 'failed' : 'unknown');
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error(this.failure || 'codexDisconnected')); }
    this.pending.clear();
    if (this.transport) { const transport = this.transport; this.transport = undefined; setTimeout(() => transport.close(), 200); }
    if (this.child && this.child.exitCode === null && this.child.pid) {
      if (process.platform === 'win32' && process.env.SystemRoot) {
        execFile(require('node:path').join(process.env.SystemRoot, 'System32', 'taskkill.exe'),
          ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, shell: false }, () => {});
      } else this.child.kill('SIGTERM');
    }
    this.emit('closed');
  }
}
module.exports = { CodexSession, CODEX_VERSION, CODEX_ERRORS, CODEX_PHASES };
