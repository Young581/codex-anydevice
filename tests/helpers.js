'use strict';

const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function host(language = 'en') {
  const commands = new Map(); const calls = []; const data = new Map(); const secrets = new Map();
  const inputs = []; const picks = []; const warnings = []; const messages = [];
  const context = {
    extensionUri: path.join(root, 'synthetic-install'), subscriptions: [],
    globalState: { get: (key) => data.get(key), update: async (key, value) => data.set(key, value) },
    secrets: { get: async (key) => secrets.get(key), store: async (key, value) => secrets.set(key, value),
      delete: async (key) => secrets.delete(key) },
  };
  const api = {
    env: { language, clipboard: { writeText: async (text) => calls.push(['clipboard', text]) },
      openExternal: async (uri) => calls.push(['external', uri]) },
    ViewColumn: { One: 1 }, StatusBarAlignment: { Right: 2 }, ConfigurationTarget: { Global: 1 },
    extensions: { getExtension: () => undefined },
    Uri: { joinPath: (base, ...parts) => path.join(base, ...parts), parse: (text) => text },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return { dispose: () => commands.delete(id) }; } },
    workspace: { isTrusted: true, workspaceFolders: [],
      getConfiguration: () => ({ get: (_, fallback) => fallback, update: async () => {} }),
      openTextDocument: async (input) => { calls.push(['open', input]); return { uri: input }; } },
    window: {
      createStatusBarItem: () => ({ show() {}, dispose() {} }),
      createWebviewPanel: () => {
        let dispose;
        return {
          reveal() { calls.push(['reveal']); }, dispose() { dispose?.(); },
          onDidDispose: (callback) => { dispose = callback; },
          webview: { cspSource: 'vscode-webview:', html: '', asWebviewUri: (uri) => uri,
            postMessage: async (message) => messages.push(message),
            onDidReceiveMessage: () => ({ dispose() {} }) },
        };
      },
      showTextDocument: async (document) => calls.push(['show', document.uri]),
      showInformationMessage: async (message) => calls.push(['message', message]),
      showErrorMessage: async (message) => calls.push(['error', message]),
      showInputBox: async (options) => { calls.push(['input', options]); return inputs.shift(); },
      showQuickPick: async (choices) => picks.length ? picks.shift() : choices[0],
      showOpenDialog: async () => [], showWarningMessage: async () => warnings.shift(),
    },
  };
  function activate() {
    const sandbox = { module: { exports: {} }, require: (name) => name === 'vscode' ? api
      : require(path.join(root, 'extension', name)) };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'extension/extension.js'), 'utf8'), sandbox);
    return sandbox.module.exports.activate(context);
  }
  return { api, context, commands, calls, data, secrets, inputs, picks, warnings, messages, activate };
}

module.exports = { host, root };
