'use strict';

const vscode = acquireVsCodeApi();
let current;
const byId = (id) => document.getElementById(id);

function showRuntime(label, status) {
  const item = document.createElement('div');
  item.className = 'runtime-item';
  const name = document.createElement('strong');
  name.textContent = label;
  const value = document.createElement('span');
  value.textContent = status;
  item.append(name, value);
  byId('runtime').append(item);
}

function update(model) {
  current = model;
  const t = model.strings;
  for (const [key, value] of Object.entries(t)) {
    const element = byId(key);
    if (element) element.textContent = value;
  }
  document.documentElement.lang = model.language;
  byId('pathsLabel').textContent = model.language.startsWith('zh') ? '手动指定运行时' : 'Choose runtime paths';
  byId('stage').textContent = model.complete ? t.ready : t.preparing;
  byId('progress').textContent = `${t.progress} ${model.completed}/3`;
  byId('botState').textContent = model.ready.bot ? t.botSaved : t.botMissing;
  byId('identityState').textContent = model.ready.identity ? t.identitySaved : t.identityMissing;
  byId('botState').classList.toggle('done', model.ready.bot);
  byId('identityState').classList.toggle('done', model.ready.identity);
  byId('projectName').textContent = model.project?.name || t.projectMissing;
  byId('projectPath').textContent = model.project?.path || '';
  byId('notice').textContent = model.notice || '';
  byId('runtime').replaceChildren();
  const env = model.environment;
  const status = (tool) => !env ? t.untested : !tool?.found ? t.missing : tool.version || t.unknown;
  showRuntime('Codex', status(env?.codex));
  showRuntime(model.language.startsWith('zh') ? 'Codex 登录' : 'Codex sign-in', env ? t[env.codex.login] : t.untested);
  if (env?.codex.detectedShim) showRuntime('Codex', t.shimHint);
  for (const button of document.querySelectorAll('button[data-action]')) {
    button.disabled = model.busy || (!model.complete && button.dataset.action === 'preview');
  }
  byId('check').textContent = model.busy ? t.checking : t.check;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled && current) {
    vscode.postMessage({ type: 'action', action: button.dataset.action });
  }
});
window.addEventListener('message', (event) => {
  if (event.data?.type === 'state') update(event.data.model);
});
vscode.postMessage({ type: 'ready' });
