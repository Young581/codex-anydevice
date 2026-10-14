'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const net = require('node:net');
const { CodexSession, CODEX_VERSION } = require('./codex-session');
const { run, version } = require('./runtime');
const { validEndpoint } = require('./shared-proxy');
const KEY = 'codexAnyDevice.officialSync.v1';
const OFFICIAL_VERSION = '26.51007.21434';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function execute(file, args, options = {}) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, shell: false,
    timeout: 15000, maxBuffer: 16384, ...options }, error => error ? reject(new Error('syncSetupFailed')) : resolve()));
}
async function privateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('syncSetupFailed');
  if (process.platform !== 'win32') { await fs.chmod(directory, 0o700); return; }
  // The path is passed as data, never interpolated into PowerShell code.
  const command = "$ErrorActionPreference='Stop'; $target=$env:ANYDEVICE_PRIVATE_DIR; "
    + "$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User; "
    + "$item=Get-Item -LiteralPath $target -Force; if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'link'}; "
    + "$existing=Get-Acl -LiteralPath $target; $private=$existing.AreAccessRulesProtected -and $existing.Access.Count -gt 0; "
    + "foreach($entry in $existing.Access){if($entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value -or $entry.AccessControlType -ne 'Allow' -or ($entry.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl){$private=$false}}; if($private){return}; "
    + "$acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetOwner($identity); $acl.SetAccessRuleProtection($true,$false); "
    + "$rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); "
    + "$acl.AddAccessRule($rule); Set-Acl -LiteralPath $target -AclObject $acl; "
    + "$check=Get-Acl -LiteralPath $target; if(!$check.AreAccessRulesProtected){throw 'acl'}; "
    + "foreach($entry in $check.Access){if($entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value){throw 'acl'}}";
  await execute(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...process.env, ANYDEVICE_PRIVATE_DIR: directory } });
}
async function connectTransport(descriptor, receive, closed) {
  const endpoint = new URL(descriptor.url), socket = net.createConnection({ host: '127.0.0.1', port: Number(endpoint.port) });
  let authenticated = false, buffer = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('syncUnavailable')); }, 8000);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(JSON.stringify({ type: 'auth', token: descriptor.token }) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 1024 * 1024) { closed('codexProtocol'); socket.destroy(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message; try { message = JSON.parse(line); } catch { closed('codexProtocol'); socket.destroy(); return; }
        if (!authenticated) {
          clearTimeout(timer);
          if (message.type !== 'authenticated') { reject(new Error('syncUnavailable')); socket.destroy(); return; }
          authenticated = true; resolve();
        } else receive(message);
      }
    });
    socket.on('error', () => { clearTimeout(timer); reject(new Error('syncUnavailable')); closed('codexDisconnected'); });
    socket.on('close', () => { clearTimeout(timer); if (!authenticated) reject(new Error('syncUnavailable')); closed('codexDisconnected'); });
  });
  return { send: message => { if (socket.destroyed || !socket.writable) throw new Error('codexDisconnected'); socket.write(JSON.stringify(message) + '\n'); }, close: () => socket.end() };
}

class SharedIntegration {
  constructor(vscode, context, t, options = {}) {
    this.vscode = vscode; this.context = context; this.t = t; this.options = options;
    this.root = context.globalStorageUri && path.join(context.globalStorageUri.fsPath, 'official-sync');
  }
  state() { return this.context.globalState.get(KEY) || {}; }
  snapshot() { return { enabled: Boolean(this.state().enabled), ready: Boolean(this.ready) }; }
  configuration() { return this.vscode.workspace.getConfiguration('chatgpt'); }
  async prepare(spec) {
    if (process.platform !== 'win32' || !this.root || Number(process.versions.node.split('.')[0]) < 24) throw new Error('syncPlatform');
    const official = this.vscode.extensions.getExtension('openai.chatgpt');
    if (official?.packageJSON.version !== OFFICIAL_VERSION) throw new Error('syncVersion');
    const probe = await (this.options.run || run)(spec, ['--version']);
    if (version(probe) !== CODEX_VERSION) throw new Error('codexUnsupported');
    await privateDirectory(this.root);
    const source = path.join(this.context.extensionUri.fsPath, 'extension');
    const payload = await fs.readFile(path.join(source, 'lib', 'shared-proxy.js'));
    await fs.writeFile(path.join(this.root, 'shared-proxy.js'), payload, { mode: 0o600 });
    await fs.writeFile(path.join(this.root, 'launch.json'), JSON.stringify({ runtime: process.execPath, spec }), { mode: 0o600 });
    const launcher = path.join(this.root, 'codex-anydevice.exe');
    try { await fs.access(launcher); } catch {
      const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
      await execute(compiler, ['/nologo', '/target:exe', '/reference:System.Web.Extensions.dll', '/out:' + launcher,
        path.join(source, 'assets', 'NativeLauncher.cs')]);
    }
    return launcher;
  }
  async enable(spec) {
    const launcher = await (this.options.prepare || this.prepare.bind(this))(spec);
    const config = this.configuration(), inspected = config.inspect('cliExecutable');
    if (inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined) throw new Error('syncOverride');
    if (this.state().enabled && inspected?.globalValue === launcher) return;
    const answer = await this.vscode.window.showWarningMessage(this.t.syncConfirm, { modal: true, detail: this.t.syncDetail }, this.t.syncAllow);
    if (answer !== this.t.syncAllow) return;
    const latest = config.inspect('cliExecutable');
    if (latest?.globalValue !== inspected?.globalValue || latest?.workspaceValue !== undefined || latest?.workspaceFolderValue !== undefined) throw new Error('syncChanged');
    const record = { enabled: true, launcher, hadGlobal: inspected?.globalValue !== undefined,
      previous: inspected?.globalValue, officialVersion: OFFICIAL_VERSION };
    await this.context.globalState.update(KEY, record);
    try { await config.update('cliExecutable', launcher, this.vscode.ConfigurationTarget.Global); }
    catch { await this.context.globalState.update(KEY, { enabled: false }); throw new Error('syncSetupFailed'); }
    this.ready = false;
    const choice = await this.vscode.window.showInformationMessage(this.t.syncReload, this.t.reload);
    if (choice === this.t.reload) await this.vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
  async disable() {
    const state = this.state();
    if (!state.enabled) return;
    const config = this.configuration();
    if (config.inspect('cliExecutable')?.globalValue !== state.launcher) throw new Error('syncChanged');
    await config.update('cliExecutable', state.hadGlobal ? state.previous : undefined, this.vscode.ConfigurationTarget.Global);
    await this.context.globalState.update(KEY, { enabled: false }); this.ready = false;
    await this.vscode.window.showInformationMessage(this.t.syncRestored);
  }
  async descriptor(spec) {
    if (!this.state().enabled || !this.root || this.configuration().get('cliExecutable') !== this.state().launcher) throw new Error('syncUnavailable');
    if (this.vscode.extensions.getExtension('openai.chatgpt')?.packageJSON.version !== OFFICIAL_VERSION) throw new Error('syncVersion');
    const directory = path.join(this.root, 'sessions', String(process.pid));
    let value; try { value = JSON.parse(await fs.readFile(path.join(directory, 'connection.json'), 'utf8')); } catch { throw new Error('syncUnavailable'); }
    if (value.schema !== 1 || !validEndpoint(value.url) || !/^[A-Za-z0-9_-]{43}$/.test(value.token)
      || !/^[a-f0-9]{32}$/.test(value.instance) || JSON.stringify(value.spec) !== JSON.stringify(spec)) throw new Error('syncUnavailable');
    return { ...value, directory };
  }
  async openThread(threadId) {
    if (!/^[a-f0-9-]{36}$/.test(threadId || '')) throw new Error('syncUnavailable');
    await this.vscode.commands.executeCommand('chatgpt.openSidebar');
    await this.vscode.commands.executeCommand('vscode.open', this.vscode.Uri.parse('vscode://openai.chatgpt/local/' + threadId));
  }
  async createSession(spec) {
    if (!this.state().enabled) return new CodexSession(spec);
    await this.vscode.commands.executeCommand('chatgpt.openSidebar');
    const descriptor = await this.descriptor(spec);
    const session = new CodexSession(spec, {
      historyMode: 'paginated',
      connect: (receive, closed) => connectTransport(descriptor, receive, closed),
      onThread: async threadId => {
        if (session.closed) throw new Error('codexDisconnected');
        await this.openThread(threadId);
        const deadline = Date.now() + 20000;
        while (!session.closed && Date.now() < deadline) {
          if (session.active?.cancelRequested) return;
          if (session.active?.desktopJoined) { this.ready = true; return; }
          await pause(100);
        }
        throw new Error('syncNotReady');
      },
    });
    return session;
  }
}
module.exports = { SharedIntegration, KEY, OFFICIAL_VERSION, connectTransport, privateDirectory };
