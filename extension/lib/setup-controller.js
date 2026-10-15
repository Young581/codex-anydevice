'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { SetupStore, readiness, setupSummary, validAppId, validSecret, validSender } = require('./setup-model');
const { strings } = require('./strings');
const { checkEnvironment, resolveCodex } = require('./runtime');
const { DirectController } = require('./direct-controller');
const { SharedIntegration } = require('./shared-integration');
const { render } = require('./webview');

const ACTIONS = new Set(['check', 'credentials', 'identity', 'selectProject', 'preview',
  'guide', 'identityGuide', 'installGuide', 'createBot', 'clear', 'chooseCodex',
  'connect', 'disconnect', 'pair', 'trustIdentity', 'forgetPairing', 'selectConversation', 'viewHistory', 'nextHistory',
  'authorizeProject', 'removeProject', 'commandButtons', 'cancel', 'showResult', 'enableSync', 'disableSync', 'openThread']);
const LINKS = {
  createBot: 'https://q.qq.com/',
  installGuide: 'https://learn.chatgpt.com/docs/cli',
};

class SetupController {
  constructor(vscode, context, options = {}) {
    this.vscode = vscode;
    this.context = context;
    this.store = new SetupStore(context);
    this.check = options.check || checkEnvironment;
    this.resolveCodex = options.resolveCodex || resolveCodex;
    this.t = strings(vscode.env.language);
    this.busy = false;
    this.environment = undefined;
    this.notice = '';
    this.panel = undefined;
    this.shared = options.shared || new SharedIntegration(vscode, context, this.t);
    this.direct = new DirectController(vscode, context, this.store, this.t, {
      createSession: spec => this.shared.createSession(spec),
      commandButtons: () => vscode.workspace.getConfiguration('codexAnyDevice').get('commandButtons', false),
      ...options.direct, onChange: () => { void this.refresh().catch(() => {}); },
    });
    this.listeners = [];
    const invalidate = () => { void this.direct.disconnect().catch(() => {}); };
    if (vscode.workspace.onDidChangeConfiguration) this.listeners.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('codexAnyDevice.codexPath')) { this.environment = undefined; invalidate(); }
      if (event.affectsConfiguration('chatgpt.cliExecutable')) { this.shared.ready = false; invalidate(); }
    }));
    if (vscode.workspace.onDidChangeWorkspaceFolders) this.listeners.push(vscode.workspace.onDidChangeWorkspaceFolders(invalidate));
    if (context.secrets.onDidChange) this.listeners.push(context.secrets.onDidChange(event => {
      if (event.key === require('./setup-model').SECRET_KEY) invalidate();
    }));
  }

  local() {
    return this.vscode.workspace.isTrusted && !this.vscode.env.remoteName;
  }

  async open() {
    if (!this.local()) return this.vscode.window.showInformationMessage(this.t.localOnly);
    if (this.panel) { this.panel.reveal(); return; }
    const panel = this.vscode.window.createWebviewPanel('codexAnyDevice.setup', 'Codex AnyDevice',
      this.vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [this.vscode.Uri.joinPath(this.context.extensionUri, 'extension', 'assets')] });
    this.panel = panel;
    panel.webview.html = render(panel.webview, this.context.extensionUri, this.vscode);
    const listener = panel.webview.onDidReceiveMessage((message) => this.receive(message));
    panel.onDidDispose(() => { listener.dispose(); if (this.panel === panel) this.panel = undefined; });
  }

  async model() {
    const state = this.store.read();
    const ready = readiness(state, await this.store.hasSecret());
    const completed = Object.values(ready).filter(Boolean).length;
    return { strings: this.t, language: this.vscode.env.language, ready, completed,
      complete: completed === 3, project: state.project, projects: state.projects, projectAuthorized: state.authorizedProject === state.project?.path,
      commandButtons: this.vscode.workspace.getConfiguration('codexAnyDevice').get('commandButtons', false),
      hasMoreHistory: Boolean(this.direct.history?.next), environment: this.environment,
      direct: this.direct.snapshot(), sync: this.shared.snapshot(), busy: this.busy, notice: this.notice };
  }

  async refresh() {
    if (this.panel) await this.panel.webview.postMessage({ type: 'state', model: await this.model() });
  }

  async receive(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      try { await this.refresh(); } catch { await this.vscode.window.showErrorMessage(this.t.operationFailed); }
      return;
    }
    if (message.type === 'action' && ACTIONS.has(message.action)) await this.act(message.action);
  }

  async act(action) {
    if (action === 'disconnect') { await this.direct.disconnect(); await this.refresh(); return; }
    if (action === 'cancel') {
      try { await this.direct.cancel(); } catch { this.notice = this.t.storageFailed; }
      await this.refresh(); return;
    }
    if (this.busy || !ACTIONS.has(action)) return;
    if (!this.local()) return this.vscode.window.showInformationMessage(this.t.localOnly);
    this.busy = true;
    this.notice = '';
    try {
      await this.refresh();
      if (['credentials', 'identity', 'selectProject', 'chooseCodex', 'authorizeProject', 'removeProject'].includes(action)) await this.direct.disconnect();
      if (LINKS[action]) await this.vscode.env.openExternal(this.vscode.Uri.parse(LINKS[action]));
      else if (action === 'check') {
        await this.checkRuntime();
        const codex = this.environment?.codex;
        const document = await this.vscode.workspace.openTextDocument({ language: 'plaintext', content:
          this.t.check + '\n\nCodex: ' + (!codex?.found ? this.t.missing : codex.version || this.t.unknown)
          + '\n' + this.t.authLabel + ': ' + (!codex?.found ? this.t.missing : this.t[codex.login] || this.t.unknown)
          + (codex?.detectedShim ? '\n' + this.t.shimHint : '') + '\n\n' + this.t.authNote });
        await this.vscode.window.showTextDocument(document, { preview: true });
      }
      else if (action === 'credentials') await this.credentials();
      else if (action === 'identity') await this.identity();
      else if (action === 'selectProject') await this.selectProject();
      else if (action === 'authorizeProject') await this.authorizeProject();
      else if (action === 'removeProject' && this.store.read().project) {
        const state = this.store.read();
        const choice = await this.vscode.window.showWarningMessage(this.t.removeProjectConfirm, { modal: true, detail: state.project.path }, this.t.removeProject);
        if (choice === this.t.removeProject && this.local()) { await this.store.removeProject(state.project.path); await this.direct.resetProjectView(); }
      }
      else if (action === 'commandButtons') await this.vscode.workspace.getConfiguration('codexAnyDevice').update('commandButtons',
        !this.vscode.workspace.getConfiguration('codexAnyDevice').get('commandButtons', false), this.vscode.ConfigurationTarget.Global);
      else if (action === 'preview') await this.preview();
      else if (action === 'guide') await this.openDocument('docs/setup.md');
      else if (action === 'identityGuide') await this.openDocument('docs/qq-identity.md');
      else if (action === 'clear') await this.clear();
      else if (action === 'chooseCodex') await this.chooseRuntime();
      else if (action === 'connect') {
        await this.checkRuntime();
        await this.direct.connect(await this.resolveCodex(this.codexOptions()));
      }
      else if (action === 'enableSync') { await this.direct.disconnect(); await this.shared.enable(await this.resolveCodex(this.codexOptions())); }
      else if (action === 'disableSync') { await this.direct.disconnect(); await this.shared.disable(); }
      else if (action === 'openThread' && (this.direct.latestThread || this.store.read().conversationId)) await this.shared.openThread(this.direct.latestThread || this.store.read().conversationId);
      else if (action === 'pair') this.direct.pair();
      else if (action === 'trustIdentity') {
        const epoch = this.direct.epoch;
        const state = await this.requireComplete();
        const answer = await this.vscode.window.showWarningMessage(this.t.trustIdentityConfirm, { modal: true,
          detail: this.t.trustIdentityDetail + '\n\n' + state.senderId + '\n\n' + state.project.path }, this.t.pairAllow);
        if (answer === this.t.pairAllow) {
          if (epoch !== this.direct.epoch || !this.local()) throw new Error('configurationChanged');
          const disconnectedEpoch = epoch + 1;
          await this.direct.disconnect();
          await this.store.confirmSender(state.senderId, () => disconnectedEpoch === this.direct.epoch && this.local() && this.store.read().appId === state.appId
            && this.store.read().senderId === state.senderId && this.store.read().project?.path === state.project.path);
          this.notice = this.t.pairRemembered;
        }
      }
      else if (action === 'forgetPairing') { await this.direct.forgetPairing(); this.notice = this.t.pairingForgotten; }
      else if (action === 'selectConversation') {
        const threads = await this.direct.listConversations();
        if (!threads.length) this.notice = this.t.noConversations;
        else {
          const target = await this.vscode.window.showQuickPick(threads.map(thread => ({ label: thread.name,
            description: thread.status === 'active' ? this.t.running : this.t.conversationIdle, thread })), { title: this.t.selectConversation });
          if (target) await this.direct.selectConversation(target.thread.id);
        }
      }
      else if (action === 'viewHistory' || action === 'nextHistory') {
        const result = await this.direct.readHistory(undefined, action === 'nextHistory');
        const document = await this.vscode.workspace.openTextDocument({ language: 'plaintext',
          content: this.t.historyTitle + '\n\n' + (result.text || this.t.noHistory) + '\n\n' + (result.next ? this.t.historyMore : this.t.historyEnd) });
        await this.vscode.window.showTextDocument(document, { preview: true });
      }
      else if (action === 'cancel') await this.direct.cancel();
      else if (action === 'showResult' && this.direct.output) {
        const document = await this.vscode.workspace.openTextDocument({ language: 'plaintext', content: this.direct.output });
        await this.vscode.window.showTextDocument(document, { preview: true });
      }
    } catch (error) {
      const allowed = ['incomplete', 'invalidProject', 'noProject', 'botRequired', 'connectRequired', 'codexMissing',
        'codexUnsupported', 'connectionBusy', 'qqNotConnected', 'qqDenied', 'qqNetwork', 'qqProtocol',
        'qqEndpoint', 'qqEndpointTransport', 'qqEndpointHost', 'qqEndpointPath', 'qqEndpointOptions',
        'qqShards', 'qqRuntime', 'configurationChanged', 'storageFailed', 'syncPlatform', 'syncVersion', 'syncOverride',
        'syncSetupFailed', 'syncUnavailable', 'syncChanged', 'syncBusy', 'syncNotReady', 'syncRequired', 'threadBusy', 'threadMissing', 'threadProject', 'continueMissing',
        'projectLimit', 'projectUnauthorized', 'historyEnd'];
      this.notice = allowed.includes(error.message) ? this.t[error.message] : this.t.operationFailed;
      await this.vscode.window.showErrorMessage(this.notice);
    } finally {
      this.busy = false;
      try { await this.refresh(); } catch { /* A disposed panel needs no update. */ }
    }
  }

  codexOptions() {
    const config = this.vscode.workspace.getConfiguration('codexAnyDevice');
    const installedCodex = this.vscode.extensions.getExtension('openai.chatgpt');
    const platform = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform];
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const codexFallbacks = installedCodex && platform ? [path.join(installedCodex.extensionPath,
      'bin', `${platform}-${arch}`, process.platform === 'win32' ? 'codex.exe' : 'codex')] : [];
    return { codexPath: config.get('codexPath', ''), codexFallbacks };
  }

  async checkRuntime() { this.environment = await this.check(this.codexOptions()); }

  async credentials() {
    const state = this.store.read();
    const appId = await this.vscode.window.showInputBox({ title: 'Codex AnyDevice',
      prompt: this.t.appIdPrompt, placeHolder: this.t.appIdHint, value: state.appId || '',
      ignoreFocusOut: true, validateInput: (value) => validAppId(value.trim()) ? undefined : this.t.invalidAppId });
    if (appId === undefined) return;
    const secret = await this.vscode.window.showInputBox({ title: 'Codex AnyDevice', password: true,
      prompt: this.t.secretPrompt, placeHolder: this.t.secretHint, ignoreFocusOut: true,
      validateInput: (value) => validSecret(value) ? undefined : this.t.invalidSecret });
    if (secret === undefined) return;
    await this.store.saveBot(appId.trim(), secret);
    this.notice = this.t.botUpdated;
  }

  async identity() {
    if (!readiness(this.store.read(), await this.store.hasSecret()).bot) throw new Error('botRequired');
    const sender = await this.vscode.window.showInputBox({ title: 'Codex AnyDevice',
      prompt: this.t.senderPrompt, placeHolder: this.t.senderHint, value: this.store.read().senderId || '',
      ignoreFocusOut: true, validateInput: (value) => validSender(value.trim()) ? undefined : this.t.invalidSender });
    if (sender !== undefined) await this.store.saveSender(sender.trim());
  }

  async selectProject() {
    const folders = (this.vscode.workspace.workspaceFolders || []).filter((folder) => folder.uri.scheme === 'file');
    const saved = this.store.read().projects || [];
    const choices = saved.map(project => ({ label: project.name, description: project.path, project }));
    choices.push(...folders.filter(folder => !saved.some(project => project.path === folder.uri.fsPath))
      .map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })));
    choices.push({ label: this.t.browseProject, browse: true });
    const choice = await this.vscode.window.showQuickPick(choices, { title: this.t.selectProject });
    if (!choice) return;
    let selected = choice.project || (choice.folder && { name: choice.folder.name, path: choice.folder.uri.fsPath });
    if (choice.browse) {
      const result = await this.vscode.window.showOpenDialog({ title: this.t.browseProject, canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (!result?.length || result[0].scheme !== 'file') return;
      selected = { name: path.basename(result[0].fsPath), path: result[0].fsPath };
    }
    if (!selected || !this.local()) return;
    const projectPath = await fs.realpath(selected.path);
    if (!(await fs.stat(projectPath)).isDirectory()) throw new Error('invalidProject');
    const previous = this.store.read().project?.path;
    await this.store.saveProject({ name: selected.name, path: projectPath });
    if (previous !== projectPath) await this.direct.resetProjectView();
  }
  async authorizeProject() {
    const epoch = this.direct.epoch, state = await this.requireComplete();
    if (!require('./setup-model').confirmed(state)) throw new Error('connectRequired');
    const answer = await this.vscode.window.showWarningMessage(this.t.connectConfirm, { modal: true,
      detail: this.t.pairIdentity + '\n' + state.senderId + '\n\n' + state.project.path + '\n\n' + this.t.connectDetail }, this.t.connectAllow);
    if (answer !== this.t.connectAllow) return;
    await this.requireComplete();
    await this.store.authorizeProject(() => epoch === this.direct.epoch && this.local()
      && this.store.read().appId === state.appId && this.store.read().senderId === state.senderId
      && this.store.read().project?.path === state.project.path);
  }

  async requireComplete() {
    const state = this.store.read();
    if (!Object.values(readiness(state, await this.store.hasSecret())).every(Boolean)) throw new Error('incomplete');
    try {
      if (!(await fs.stat(state.project.path)).isDirectory()) throw new Error('invalidProject');
      if (await fs.realpath(state.project.path) !== state.project.path) throw new Error('invalidProject');
    } catch { throw new Error('invalidProject'); }
    return state;
  }

  async preview() {
    const state = await this.requireComplete();
    const document = await this.vscode.workspace.openTextDocument({ language: 'json',
      content: JSON.stringify(setupSummary(state), null, 2) + '\n' });
    await this.vscode.window.showTextDocument(document, { preview: true });
  }

  async openDocument(relative) {
    const uri = this.vscode.Uri.joinPath(this.context.extensionUri, ...relative.split('/'));
    await this.vscode.window.showTextDocument(await this.vscode.workspace.openTextDocument(uri), { preview: true });
  }

  async chooseRuntime() {
    const result = await this.vscode.window.showOpenDialog({ title: this.t.chooseExecutable,
      canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
    if (!result?.length || result[0].scheme !== 'file') return;
    await this.vscode.workspace.getConfiguration('codexAnyDevice').update('codexPath', result[0].fsPath,
      this.vscode.ConfigurationTarget.Global);
    this.environment = undefined;
  }

  async clear() {
    const answer = await this.vscode.window.showWarningMessage(this.t.clearPrompt, { modal: true }, this.t.clearConfirm);
    if (answer !== this.t.clearConfirm) return;
    await this.direct.clear();
    await this.store.clear();
    this.notice = this.t.settingsCleared;
  }

  dispose() { this.direct.dispose(); for (const listener of this.listeners) listener.dispose(); this.panel?.dispose(); }
}

module.exports = { SetupController, ACTIONS };
