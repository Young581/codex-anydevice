'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { SetupStore, readiness, configFragment, bindCommand, validAppId, validSecret, validSender } = require('./setup-model');
const { strings } = require('./strings');
const { checkEnvironment } = require('./runtime');
const { render } = require('./webview');

const ACTIONS = new Set(['check', 'credentials', 'identity', 'selectProject', 'preview', 'copyBind',
  'guide', 'installGuide', 'createBot', 'clear', 'chooseCodex', 'chooseOpenClaw']);
const LINKS = {
  createBot: 'https://q.qq.com/',
  installGuide: 'https://docs.openclaw.ai/install',
};

class SetupController {
  constructor(vscode, context, options = {}) {
    this.vscode = vscode;
    this.context = context;
    this.store = new SetupStore(context);
    this.check = options.check || checkEnvironment;
    this.t = strings(vscode.env.language);
    this.busy = false;
    this.environment = undefined;
    this.notice = '';
    this.panel = undefined;
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
      complete: completed === 3, project: state.project, environment: this.environment,
      busy: this.busy, notice: this.notice };
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
    if (this.busy || !ACTIONS.has(action)) return;
    if (!this.local()) return this.vscode.window.showInformationMessage(this.t.localOnly);
    this.busy = true;
    this.notice = '';
    try {
      await this.refresh();
      if (LINKS[action]) await this.vscode.env.openExternal(this.vscode.Uri.parse(LINKS[action]));
      else if (action === 'check') await this.checkRuntime();
      else if (action === 'credentials') await this.credentials();
      else if (action === 'identity') await this.identity();
      else if (action === 'selectProject') await this.selectProject();
      else if (action === 'preview') await this.preview();
      else if (action === 'copyBind') await this.copyBind();
      else if (action === 'guide') await this.openDocument('docs/setup.md');
      else if (action === 'clear') await this.clear();
      else if (action === 'chooseCodex' || action === 'chooseOpenClaw') await this.chooseRuntime(action);
    } catch (error) {
      const allowed = ['incomplete', 'invalidProject', 'noProject'];
      this.notice = allowed.includes(error.message) ? this.t[error.message] : this.t.operationFailed;
      await this.vscode.window.showErrorMessage(this.notice);
    } finally {
      this.busy = false;
      try { await this.refresh(); } catch { /* A disposed panel needs no update. */ }
    }
  }

  async checkRuntime() {
    const config = this.vscode.workspace.getConfiguration('codexAnyDevice');
    const installedCodex = this.vscode.extensions.getExtension('openai.chatgpt');
    const platform = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform];
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const codexFallbacks = installedCodex && platform ? [path.join(installedCodex.extensionPath,
      'bin', `${platform}-${arch}`, process.platform === 'win32' ? 'codex.exe' : 'codex')] : [];
    this.environment = await this.check({ codexPath: config.get('codexPath', ''),
      openclawPath: config.get('openclawPath', ''), codexFallbacks });
  }

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
    const sender = await this.vscode.window.showInputBox({ title: 'Codex AnyDevice',
      prompt: this.t.senderPrompt, placeHolder: this.t.senderHint, value: this.store.read().senderId || '',
      ignoreFocusOut: true, validateInput: (value) => validSender(value.trim()) ? undefined : this.t.invalidSender });
    if (sender !== undefined) await this.store.saveSender(sender.trim());
  }

  async selectProject() {
    const folders = (this.vscode.workspace.workspaceFolders || []).filter((folder) => folder.uri.scheme === 'file');
    if (!folders.length) throw new Error('noProject');
    const choices = folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder }));
    const choice = await this.vscode.window.showQuickPick(choices, { title: this.t.selectProject });
    if (!choice) return;
    const projectPath = await fs.realpath(choice.folder.uri.fsPath);
    if (!(await fs.stat(projectPath)).isDirectory()) throw new Error('invalidProject');
    await this.store.saveProject({ name: choice.folder.name, path: projectPath });
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
      content: JSON.stringify(configFragment(state), null, 2) + '\n' });
    await this.vscode.window.showTextDocument(document, { preview: true });
  }

  async copyBind() {
    const state = await this.requireComplete();
    await this.vscode.env.clipboard.writeText(bindCommand(state.project));
    this.notice = this.t.copied;
  }

  async openDocument(relative) {
    const uri = this.vscode.Uri.joinPath(this.context.extensionUri, ...relative.split('/'));
    await this.vscode.window.showTextDocument(await this.vscode.workspace.openTextDocument(uri), { preview: true });
  }

  async chooseRuntime(action) {
    const result = await this.vscode.window.showOpenDialog({ title: this.t.chooseExecutable,
      canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
    if (!result?.length || result[0].scheme !== 'file') return;
    const key = action === 'chooseCodex' ? 'codexPath' : 'openclawPath';
    await this.vscode.workspace.getConfiguration('codexAnyDevice').update(key, result[0].fsPath,
      this.vscode.ConfigurationTarget.Global);
    this.environment = undefined;
  }

  async clear() {
    const answer = await this.vscode.window.showWarningMessage(this.t.clearPrompt, { modal: true }, this.t.clearConfirm);
    if (answer !== this.t.clearConfirm) return;
    await this.store.clear();
    this.notice = this.t.settingsCleared;
  }

  dispose() { this.panel?.dispose(); }
}

module.exports = { SetupController, ACTIONS };
