'use strict';

const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { QqClient, suggestCommands } = require('./qq-client');
const { CodexSession, CODEX_ERRORS, CODEX_PHASES } = require('./codex-session');
const { SECRET_KEY, validProject, validSender, validThreadId, confirmed, authorized, readiness } = require('./setup-model');
const JOURNAL_KEY = 'codexAnyDevice.direct.v1';
const ACTIVE = new Set(['starting', 'running', 'waitingApproval', 'cancelling']);
const digest = value => createHash('sha256').update(value).digest('hex');
const ERRORS = new Set(['qqDenied', 'qqNetwork', 'qqProtocol', 'qqEndpoint', 'qqShards', 'qqRuntime',
  'qqEndpointTransport', 'qqEndpointHost', 'qqEndpointPath', 'qqEndpointOptions',
  ...CODEX_ERRORS, 'configurationChanged', 'storageFailed']);

// OS-owned loopback reservation: no control API, credentials, data or stale lock files.
function reserveBot(appId) {
  const port = 40000 + parseInt(digest(os.homedir() + ':' + appId).slice(0, 6), 16) % 20000;
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => socket.destroy());
    server.once('error', () => reject(new Error('connectionBusy')));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.unref(); resolve(() => new Promise(done => server.close(done)));
    });
  });
}
function journal(input) {
  let floor = Number.isSafeInteger(input?.floor) ? input.floor : 0;
  const seen = Array.isArray(input?.seen) ? input.seen.filter(item => /^[a-f0-9]{64}$/.test(item?.hash)
    && Number.isSafeInteger(item.at)).map(({ hash, at }) => ({ hash, at })).sort((a, b) => a.at - b.at) : [];
  while (seen.length > 512) floor = Math.max(floor, seen.shift().at);
  const last = input?.last && /^[a-f0-9]{12}$/.test(input.last.id)
    ? { id: input.last.id, status: ACTIVE.has(input.last.status) ? 'unknown'
      : ['completed', 'failed', 'cancelled', 'unknown'].includes(input.last.status) ? input.last.status : 'unknown' } : undefined;
  if (last && ERRORS.has(input.last.error)) last.error = input.last.error;
  if (last && CODEX_PHASES.includes(input.last.phase)) last.phase = input.last.phase;
  return { seen, floor, last };
}

class DirectController {
  constructor(vscode, context, store, t, options = {}) {
    this.vscode = vscode; this.context = context; this.store = store; this.t = t; this.options = options;
    this.qq = options.qq || new QqClient(); this.status = 'disconnected'; this.queue = Promise.resolve();
    this.saves = Promise.resolve(); this.epoch = 0; this.pending = 0; this.deliveryFailed = false;
    this.data = journal(context.globalState.get(JOURNAL_KEY));
    this.qq.on('state', value => {
      this.status = value; this.changed();
      if (value === 'connected' && this.selected && !this.allowed && !this.pairing && !this.task) this.pair();
      if (['qqDenied', 'qqNetwork'].includes(value)) void this.disconnect(value).catch(() => {});
    });
    this.qq.on('message', message => {
      if (this.pending >= 32) return; this.pending++;
      const epoch = this.epoch;
      this.queue = this.queue.then(() => epoch === this.epoch && this.handle(message, epoch))
        .catch(error => {
          if (epoch !== this.epoch) return;
          if (['syncRequired', 'threadBusy', 'threadMissing', 'threadProject', 'continueMissing', 'syncBusy', 'projectUnauthorized', 'projectMissing', 'invalidProject', 'historyEnd'].includes(error.message)) {
            return this.reply(message, this.t[error.message], epoch);
          }
          this.error = ERRORS.has(error.message) ? error.message : 'operationFailed';
          return this.disconnect().catch(() => {});
        }).finally(() => { this.pending--; });
    });
  }
  local() { return this.vscode.workspace.isTrusted && !this.vscode.env.remoteName; }
  changed() { this.options.onChange?.(); }
  now() { return (this.options.now || Date.now)(); }
  snapshot() {
    const state = this.store.read();
    return { status: this.status, paired: Boolean(this.allowed), remembered: confirmed(state), task: this.data.last,
      busy: Boolean(this.task || this.switching), deliveryFailed: this.deliveryFailed, error: this.error || this.data.last?.error,
      buttonsUnavailable: Boolean(this.qq.buttonsUnavailable),
      phase: this.currentPhase || this.data.last?.phase,
      hasResult: Boolean(this.output), hasThread: Boolean(this.latestThread || state.conversationId), readOnly: this.readOnly,
      conversation: state.conversationId ? this.threads?.find(thread => thread.id === state.conversationId)?.name || this.t.conversationSelected : undefined,
      pairingCode: this.pairing && this.now() < this.pairing.expires ? this.pairing.code : undefined };
  }
  async persist() {
    const value = JSON.parse(JSON.stringify(this.data));
    this.saves = this.saves.catch(() => {}).then(() => this.context.globalState.update(JOURNAL_KEY, value));
    try { await this.saves; } catch { throw new Error('storageFailed'); }
  }
  taskStatus(task = this.data.last) {
    if (!task) return this.t.noTask;
    return this.t.phoneStatus + task.id + ' \u00b7 ' + this.t[task.status]
      + (task.phase && (task.error || task.status === 'unknown') ? '\n' + this.t.taskPhase + this.t[task.phase] : '')
      + (task.error ? '\n' + this.t.taskReason + this.t[task.error]
        : task.status === 'unknown' ? '\n' + this.t.taskUnknownNote : '');
  }
  async project() {
    const current = this.store.read();
    if (!this.local() || !validProject(current.project) || !readiness(current, await this.store.hasSecret()).bot) throw new Error('connectRequired');
    let resolved;
    try {
      resolved = await fs.realpath(current.project.path);
      if (resolved !== current.project.path || !(await fs.stat(resolved)).isDirectory()) throw new Error();
    } catch { throw new Error('invalidProject'); }
    if (this.selected && (current.appId !== this.selected.appId || resolved !== this.selected.project.path
      || (this.allowed && (current.senderId !== this.allowed || !authorized(current))))) throw new Error('configurationChanged');
    return current;
  }
  valid(epoch, operation) {
    return epoch === this.epoch && this.local() && this.selected && (!operation || this.task === operation);
  }
  async connect(spec) {
    if (this.connecting || this.selected) return;
    if (!spec) throw new Error('codexMissing');
    this.connecting = true; const epoch = ++this.epoch;
    let release;
    try {
      const selected = await this.project();
      if (confirmed(selected) && !authorized(selected)) {
        const answer = await this.vscode.window.showWarningMessage(this.t.connectConfirm, { modal: true,
          detail: this.t.pairIdentity + '\n' + selected.senderId + '\n\n' + selected.project.path + '\n\n' + this.t.connectDetail }, this.t.connectAllow);
        if (answer !== this.t.connectAllow || epoch !== this.epoch || !this.local()) return;
        const current = await this.project();
        if (current.appId !== selected.appId || current.senderId !== selected.senderId || current.project.path !== selected.project.path || !confirmed(current)) throw new Error('configurationChanged');
        await this.store.authorizeProject(() => epoch === this.epoch && this.local()
          && this.store.read().appId === selected.appId && this.store.read().senderId === selected.senderId
          && this.store.read().project?.path === selected.project.path);
      }
      const latest = await this.project();
      if (epoch !== this.epoch || latest.appId !== selected.appId || latest.project.path !== selected.project.path) return;
      release = await (this.options.reserve || reserveBot)(selected.appId);
      if (epoch !== this.epoch || !this.local()) { await release(); release = undefined; return; }
      this.release = release; release = undefined;
      this.selected = latest; this.spec = spec; this.allowed = authorized(latest) ? latest.senderId : undefined;
      this.latestThread = latest.conversationId; this.deliveryFailed = false; this.error = undefined;
      const secret = await this.context.secrets.get(SECRET_KEY);
      if (!this.valid(epoch)) { if (epoch === this.epoch) await this.disconnect(); return; }
      await this.qq.start(selected.appId, secret);
    } catch (error) {
      if (epoch === this.epoch) { await this.disconnect(); throw error; }
    } finally {
      if (release) await release();
      if (epoch === this.epoch) this.connecting = false;
      this.changed();
    }
  }
  pair() {
    if (!this.local() || this.status !== 'connected' || this.task) throw new Error('qqNotConnected');
    this.allowed = undefined;
    this.pairGeneration = (this.pairGeneration || 0) + 1;
    this.pairing = { code: randomBytes(4).toString('hex').toUpperCase(), expires: this.now() + 5 * 60000, attempts: 0 };
    const pairing = this.pairing;
    clearTimeout(this.pairTimer);
    this.pairTimer = setTimeout(() => {
      if (this.pairing === pairing) { this.pairing = undefined; this.changed(); }
    }, 5 * 60000);
    this.changed();
  }
  async duplicate(message) {
    const hash = digest(this.selected.appId + ':' + message.sender + ':' + message.id);
    if (message.at <= this.data.floor || this.data.seen.some(item => item.hash === hash)) return true;
    this.data.seen.push({ hash, at: message.at });
    if (this.data.seen.length > 512) {
      this.data.seen.sort((a, b) => a.at - b.at);
      this.data.floor = Math.max(this.data.floor, this.data.seen.shift().at);
    }
    await this.persist(); return false;
  }
  async reply(message, text, epoch = this.epoch, commands) {
    if (!this.valid(epoch)) return;
    try {
      const buttonsUnavailable = this.qq.buttonsUnavailable;
      await this.qq.reply(message, text, this.options.commandButtons?.() ? commands : undefined);
      if (buttonsUnavailable !== this.qq.buttonsUnavailable) this.changed();
    } catch {
      if (epoch === this.epoch) { this.deliveryFailed = true; this.changed(); }
    }
  }
  async handle(message, epoch = this.epoch) {
    if (!this.valid(epoch) || this.status !== 'connected' || !validSender(message?.sender)
      || typeof message.id !== 'string' || !message.id || message.id.length > 512
      || typeof message.text !== 'string' || message.text.length > 12000 || !Number.isSafeInteger(message.at)
      || message.at > this.now() + 60000 || this.now() - message.at > 5 * 60000) return;
    if (message.text.startsWith('/pair ')) {
      const generation = this.pairGeneration;
      const pairing = this.pairing; const candidate = message.text.slice(6).trim().toUpperCase();
      if (!pairing || this.now() >= pairing.expires || ++pairing.attempts > 5) {
        this.pairing = undefined; this.changed(); return;
      }
      if (!/^[A-F0-9]{8}$/.test(candidate) || !timingSafeEqual(Buffer.from(candidate), Buffer.from(pairing.code))) {
        if (pairing.attempts >= 5) { this.pairing = undefined; this.changed(); }
        return;
      }
      if (await this.duplicate(message) || !this.valid(epoch) || this.pairing !== pairing) return;
      this.pairing = undefined; clearTimeout(this.pairTimer); this.changed();
      const selected = await this.project();
      const answer = await this.vscode.window.showWarningMessage(this.t.pairConfirm, {
        modal: true, detail: this.t.pairIdentity + '\n' + message.sender + '\n\n' + selected.project.path + '\n\n' + this.t.connectDetail,
      }, this.t.pairAllow);
      if (answer !== this.t.pairAllow || !this.valid(epoch) || this.now() >= pairing.expires || generation !== this.pairGeneration) return;
      await this.project(); if (!this.valid(epoch)) return;
      await this.store.confirmSender(message.sender, () => this.valid(epoch) && generation === this.pairGeneration
        && this.now() < pairing.expires && this.store.read().project?.path === selected.project.path
        && this.store.read().appId === selected.appId); if (!this.valid(epoch)) return;
      this.allowed = message.sender; this.changed(); await this.reply(message, this.t.phonePaired, epoch); return;
    }
    if (!this.allowed || message.sender !== this.allowed || this.store.read().senderId !== this.allowed) return;
    if (await this.duplicate(message) || !this.valid(epoch)) return;
    await this.project(); if (!this.valid(epoch)) return;
    if (message.text === '/status') {
      await this.reply(message, this.t.currentProject + ': ' + this.store.read().project.name + '\n' + this.taskStatus()
        + (this.store.read().conversationId ? '\n' + this.t.conversationSelected : ''), epoch);
    } else if (message.text === '/cancel') {
      if (this.task) { await this.cancel(); await this.reply(message, this.t.phoneCancelling, epoch); }
      else await this.reply(message, this.t.noTask, epoch);
    } else if (message.text === '/projects') {
      this.projectList = (this.store.read().projects || []).filter(project => project.authorized);
      await this.reply(message, this.t.phoneProjects + '\n' + this.projectList.map((project, i) => `${i + 1}. ${project.name.slice(0, 48)}${project.path === this.selected.project.path ? ' *' : ''}`).join('\n') + '\n' + this.t.phoneProjectUse, epoch, ['/project ']);
    } else if (/^\/project\s+\d+$/.test(message.text)) {
      if (this.task || this.switching) { await this.reply(message, this.t.phoneBusy, epoch); return; }
      const target = this.projectList?.[Number(message.text.split(/\s+/)[1]) - 1];
      if (!target) { await this.reply(message, this.t.phoneProjectUse, epoch); return; }
      await this.switchProject(target.path);
      await this.reply(message, this.t.currentProject + ': ' + this.store.read().project.name + '\n' + this.t.phoneHelp, epoch);
    } else if (message.text === '/sessions' || message.text === '/sessions next') {
      if (this.task) { await this.reply(message, this.t.phoneBusy, epoch); return; }
      if (message.text.endsWith(' next') && !this.sessionsCursor) { await this.reply(message, this.t.noMoreSessions, epoch); return; }
      const threads = await this.listConversations(message.text.endsWith(' next') ? this.sessionsCursor : undefined);
      if (!this.valid(epoch)) return;
      await this.reply(message, threads.length ? this.t.phoneSessions + '\n' + threads.map((thread, i) => `${i + 1}. ${thread.name}${thread.status === 'active' ? ' · ' + this.t.running : ''}`).join('\n') + '\n' + this.t.phoneUse + (this.sessionsCursor ? '\n' + this.t.moreSessions : '') : this.t.noConversations, epoch, ['/use ', '/sessions next', '/history']);
    } else if (/^\/use\s+\d+$/.test(message.text)) {
      const index = Number(message.text.split(/\s+/)[1]) - 1;
      const target = this.threads?.[index];
      if (!target) { await this.reply(message, this.t.phoneUse, epoch); return; }
      await this.selectConversation(target.id);
      await this.reply(message, this.t.conversationSelected + ': ' + target.name, epoch);
    } else if (/^\/history(?:\s+(?:\d+|next))?$/.test(message.text)) {
      const argument = message.text.split(/\s+/)[1];
      const threadId = argument && argument !== 'next' ? this.threads?.[Number(argument) - 1]?.id : undefined;
      if (argument && argument !== 'next' && !threadId) { await this.reply(message, this.t.historyHelp, epoch); return; }
      const result = await this.readHistory(threadId, argument === 'next');
      await this.reply(message, this.t.historyTitle + '\n' + (result.text || this.t.noHistory)
        + '\n' + (result.next ? this.t.historyMore : this.t.historyEnd), epoch, ['/history next', '/continue ']);
    } else if ((message.text.startsWith('/new ') && message.text.slice(5).trim())
      || (message.text.startsWith('/continue ') && message.text.slice(10).trim())) {
      if (this.task) { await this.reply(message, this.t.phoneBusy, epoch); return; }
      const continuing = message.text.startsWith('/continue '), threadId = continuing ? this.store.read().conversationId : undefined;
      if (continuing && !threadId) { await this.reply(message, this.t.continueMissing, epoch); return; }
      const operation = { id: randomBytes(6).toString('hex'), status: 'starting', cancelRequested: false, threadId };
      this.task = operation; this.data.last = { id: operation.id, status: 'starting' }; this.output = ''; this.error = undefined;
      this.currentPhase = undefined; this.readOnly = undefined;
      if (!continuing) this.latestThread = undefined;
      try { await this.persist(); } catch (error) { this.task = undefined; this.data.last.status = 'unknown'; throw error; }
      this.changed(); await this.reply(message, this.t.phoneAccepted + operation.id, epoch);
      void this.execute(operation, message.text.slice(continuing ? 10 : 5).trim(), message, epoch);
    } else {
      const prefix = message.text === '/help' ? '/' : message.text;
      const suggestions = /^\/[a-z]*$/i.test(prefix) || prefix === '/' ? suggestCommands(prefix) : [];
      await this.reply(message, this.t.phoneHelp + (suggestions.length ? '\n\n' + this.t.commandSuggestions + '\n' + suggestions.join('\n') : ''), epoch, suggestions);
    }
  }
  async switchProject(projectPath) {
    const epoch = this.epoch;
    if (!this.valid(epoch) || !this.allowed || this.task || this.switching) throw new Error('syncBusy');
    const current = await this.project();
    const project = current.projects?.find(item => item.path === projectPath && item.authorized);
    if (!project) throw new Error('projectUnauthorized');
    try { if (await fs.realpath(project.path) !== project.path || !(await fs.stat(project.path)).isDirectory()) throw new Error(); }
    catch { throw new Error('invalidProject'); }
    if (!this.valid(epoch) || this.task) throw new Error('configurationChanged');
    this.switching = true; this.changed();
    try {
      await this.store.switchProject(projectPath, () => this.valid(epoch) && !this.task
        && this.store.read().appId === current.appId && this.store.read().senderId === current.senderId
        && this.store.read().project?.path === current.project.path);
      if (!this.valid(epoch)) return;
      this.selected = this.store.read(); this.scopeRevision = (this.scopeRevision || 0) + 1;
      await this.resetProjectView();
    } finally { this.switching = false; this.changed(); }
  }
  async resetProjectView() {
    this.latestThread = this.store.read().conversationId; this.threads = undefined; this.sessionsCursor = undefined; this.history = undefined;
    this.output = ''; this.data.last = undefined; this.error = undefined; this.currentPhase = undefined; this.readOnly = undefined;
    await this.persist(); this.changed();
  }
  async querySession(action) {
    const epoch = this.epoch;
    if (!this.valid(epoch) || this.status !== 'connected' || !this.allowed) throw new Error('qqNotConnected');
    if (this.task || this.switching) throw new Error('syncBusy');
    const revision = this.scopeRevision;
    const selected = await this.project();
    const session = await (this.options.createSession || (spec => new CodexSession(spec)))(this.spec);
    try {
      if (!this.valid(epoch) || this.task || this.switching || revision !== this.scopeRevision) throw new Error('configurationChanged');
      await session.start(selected.project.path);
      const result = await action(session, selected.project.path);
      await this.project();
      if (!this.valid(epoch) || this.task || this.switching || revision !== this.scopeRevision) throw new Error('configurationChanged');
      return result;
    } finally { session.stop(); }
  }
  async listConversations(cursor) {
    this.threads = await this.querySession((session, cwd) => session.listThreads(cwd, cursor));
    this.sessionsCursor = this.threads.nextCursor;
    this.changed(); return this.threads;
  }
  async readHistory(threadId, next = false) {
    if (next && !this.history?.next) throw new Error('historyEnd');
    const target = next ? this.history.threadId : threadId || this.store.read().conversationId;
    const page = next ? this.history.next : undefined;
    if (!target) throw new Error('continueMissing');
    const result = await this.querySession((session, cwd) => session.readHistory(target, cwd, page));
    this.history = { threadId: target, next: result.next }; return result;
  }
  async selectConversation(threadId) {
    const epoch = this.epoch;
    if (!validThreadId(threadId)) throw new Error('threadMissing');
    await this.querySession(async (session, cwd) => { await session.checkThread(threadId, cwd); });
    await this.project();
    await this.store.saveConversation(threadId, () => this.valid(epoch) && !this.task);
    if (!this.valid(epoch)) return;
    this.latestThread = threadId; this.history = undefined; this.changed();
  }
  async forgetPairing() {
    await this.disconnect(); await this.store.forgetPairing(); this.latestThread = undefined; this.threads = undefined; this.changed();
  }
  async execute(operation, prompt, source, epoch) {
    let result = { status: 'unknown', output: '' }; let session;
    try {
      if (!this.valid(epoch, operation) || !this.allowed) return;
      if (operation.cancelRequested) { result.status = 'cancelled'; return; }
      const selected = await this.project();
      if (!this.valid(epoch, operation)) return;
      session = await (this.options.createSession || (spec => new CodexSession(spec)))(this.spec);
      if (!this.valid(epoch, operation)) { session.stop(); return; }
      this.session = session;
      session.on('thread', threadId => {
        if (this.valid(epoch, operation)) { this.latestThread = threadId; this.changed(); }
      });
      session.on('phase', phase => {
        if (this.valid(epoch, operation) && CODEX_PHASES.includes(phase)) {
          this.currentPhase = phase; this.data.last.phase = phase; this.changed();
        }
      });
      session.on('policy', policy => {
        if (this.valid(epoch, operation)) { this.readOnly = policy.readOnly; this.changed(); }
      });
      session.on('approval', request => {
        void this.approve(request, operation, epoch, session).catch(() => {
          try { session.decide(request.id, 'decline'); } catch { session.stop(); }
        });
      });
      session.on('approvalsChanged', () => {
        if (!this.valid(epoch, operation) || operation.cancelRequested || session.closed || !session.active) return;
        operation.status = session.requests.size ? 'waitingApproval' : 'running';
        this.data.last = { id: operation.id, status: operation.status, phase: this.currentPhase }; this.changed();
      });
      await session.start(selected.project.path);
      if (!this.valid(epoch, operation)) return;
      if (operation.cancelRequested) { result.status = 'cancelled'; return; }
      await this.project();
      operation.status = 'running'; this.data.last = { id: operation.id, status: 'running', phase: this.currentPhase }; await this.persist();
      if (!this.valid(epoch, operation)) return;
      if (operation.cancelRequested) { result.status = 'cancelled'; return; }
      this.changed(); result = await session.execute(prompt, selected.project.path, operation.threadId);
      if (this.valid(epoch, operation) && validThreadId(result.threadId)) {
        await this.project(); await this.store.saveConversation(result.threadId, () => this.valid(epoch, operation)); this.latestThread = result.threadId;
      }
      if (this.valid(epoch, operation) && session.failure) this.error = ERRORS.has(session.failure) ? session.failure : 'codexTaskFailed';
    } catch (error) {
      if (this.valid(epoch, operation)) {
        this.error = ERRORS.has(error.message) ? error.message : 'codexRequestFailed';
        if (!session?.turnRequested) result.status = 'failed';
      }
    } finally {
      session?.stop();
      if (this.session === session) this.session = undefined;
      if (this.task === operation && epoch === this.epoch) {
        clearTimeout(this.cancelTimer);
        const completed = { id: operation.id, status: result.status };
        if (ERRORS.has(this.error)) completed.error = this.error;
        if (CODEX_PHASES.includes(this.currentPhase)) completed.phase = this.currentPhase;
        this.data.last = completed; this.task = undefined; this.output = result.output || '';
        try { await this.persist(); } catch {
          completed.status = 'unknown';
          if (this.data.last === completed && epoch === this.epoch) { this.error = 'storageFailed'; completed.error = 'storageFailed'; }
        }
        this.changed();
        await this.reply(source, this.taskStatus(completed)
          + (result.output ? '\n\n' + result.output.slice(0, 1400) + (result.output.length > 1400 ? '\n' + this.t.phoneLongResult : '') : ''), epoch);
      }
    }
  }
  async approve(request, operation, epoch, session) {
    if (!this.valid(epoch, operation) || !this.allowed || !session.hasRequest(request.id)) return session.decide(request.id, 'decline');
    const detail = JSON.stringify({ requestId: request.id, ...request.params, item: request.item }, null, 2);
    // Do not offer approval when the native dialog cannot show the complete request.
    if (detail.length > 12000) { session.decide(request.id, 'decline'); this.error = 'codexUnsupportedRequest'; this.changed(); return; }
    const choice = await this.vscode.window.showWarningMessage(this.t.approvalTitle, {
      modal: true, detail: this.t.approvalDetail + '\n\n' + detail,
    }, this.t.approveOnce, this.t.rejectOnce);
    let valid = this.valid(epoch, operation) && !operation.cancelRequested && this.allowed === this.store.read().senderId
      && this.now() < request.expiresAt && session.hasRequest(request.id);
    if (valid) { try { await this.project(); } catch { valid = false; } }
    valid = valid && this.valid(epoch, operation) && !operation.cancelRequested && session.hasRequest(request.id);
    session.decide(request.id, valid && choice === this.t.approveOnce ? 'accept' : 'decline');
  }
  async cancel() {
    const operation = this.task; if (!operation) return;
    operation.cancelRequested = true; operation.status = 'cancelling';
    this.data.last = { id: operation.id, status: 'cancelling' }; this.changed();
    const session = this.session;
    clearTimeout(this.cancelTimer);
    this.cancelTimer = setTimeout(() => { if (this.task === operation) session?.stop('codexTimeout'); }, 10000);
    // The native interrupt must not wait for storage or a slow RPC acknowledgement.
    if (session) void session.interrupt().catch(() => session.stop());
    await this.persist();
  }
  async disconnect(state = 'disconnected') {
    this.epoch++; this.connecting = false; this.allowed = undefined; this.pairing = undefined;
    clearTimeout(this.pairTimer); clearTimeout(this.cancelTimer);
    const release = this.release; this.release = undefined;
    const session = this.session; this.session = undefined;
    const operation = this.task; this.task = undefined; this.selected = undefined; this.spec = undefined;
    this.qq.stop(); this.status = state; session?.stop(); this.threads = undefined; this.projectList = undefined;
    this.history = undefined; this.sessionsCursor = undefined;
    if (operation) this.data.last = { id: operation.id, status: 'unknown', error: 'codexDisconnected', phase: this.currentPhase };
    try { if (operation) await this.persist(); }
    finally { if (release) await release(); this.changed(); }
  }
  async clear() {
    await this.disconnect(); this.data = { seen: [], floor: this.now(), last: undefined }; this.output = '';
    this.error = undefined; this.currentPhase = undefined; this.latestThread = undefined; await this.persist();
  }
  dispose() { void this.disconnect().catch(() => {}); }
}
module.exports = { DirectController, JOURNAL_KEY, journal, reserveBot };
