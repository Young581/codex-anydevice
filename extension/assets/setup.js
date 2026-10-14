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
  byId('stage').textContent = model.direct?.paired ? t.paired : t[model.direct?.status] || t.disconnected;
  byId('progress').textContent = model.direct?.paired ? t.readyTask : t.needsPairing;
  byId('botState').textContent = model.ready.bot ? t.botSaved : t.botMissing;
  byId('identityState').textContent = model.ready.identity ? t.identitySaved : t.identityMissing;
  if (model.direct?.paired) byId('identityState').textContent = t.paired;
  byId('botState').classList.toggle('done', model.ready.bot);
  byId('identityState').classList.toggle('done', model.ready.identity);
  byId('projectName').textContent = model.project?.name || t.projectMissing;
  byId('projectPath').textContent = model.project?.path || '';
  byId('notice').textContent = model.notice || '';
  byId('runtime').replaceChildren();
  const env = model.environment;
  const status = (tool) => !env ? t.untested : !tool?.found ? t.missing : tool.version || t.unknown;
  showRuntime('Codex', status(env?.codex));
  showRuntime(t.authLabel, !env ? t.untested : !env.codex?.found ? t.missing : t[env.codex.login] || t.unknown);
  if (env?.codex.detectedShim) showRuntime('Codex', t.shimHint);
  for (const button of document.querySelectorAll('button[data-action]')) {
    button.disabled = model.busy || (!model.complete && button.dataset.action === 'preview');
  }
  const direct = model.direct || { status: 'disconnected' };
  const active = ['connected', 'connecting', 'reconnecting'].includes(direct.status);
  byId('connectionState').textContent = t[direct.status] || t.unknown;
  byId('pairState').textContent = direct.paired ? t.paired : t.identityMissing;
  byId('connectionState').classList.toggle('done', direct.status === 'connected');
  byId('pairState').classList.toggle('done', Boolean(direct.paired));
  byId('connect').disabled = model.busy || active || !model.ready.bot || !model.ready.project;
  byId('disconnect').disabled = !active && !model.busy;
  byId('pair').disabled = model.busy || direct.status !== 'connected' || direct.busy;
  byId('cancel').disabled = model.busy || !direct.busy;
  byId('showResult').disabled = model.busy || !direct.hasResult;
  byId('openThread').disabled = model.busy || !direct.hasThread || !model.sync?.enabled;
  byId('enableSync').disabled = model.busy || Boolean(model.sync?.enabled);
  byId('disableSync').disabled = model.busy || !model.sync?.enabled;
  byId('disableSync').hidden = !model.sync?.enabled;
  byId('syncState').textContent = model.sync?.ready ? t.syncReady : model.sync?.enabled ? t.syncConfigured : t.syncDisabled;
  byId('pair').textContent = t.pair;
  byId('pair').hidden = Boolean(direct.pairingCode || direct.paired);
  byId('pairBox').hidden = !direct.pairingCode;
  byId('pairingCode').textContent = direct.pairingCode ? '/pair ' + direct.pairingCode : '';
  byId('taskState').textContent = direct.task ? t.phoneStatus + direct.task.id + ' · ' + (t[direct.task.status] || t.unknown)
    + (direct.phase ? ' · ' + (t[direct.phase] || '') : '') : t.noTask;
  byId('directError').textContent = direct.error ? t[direct.error] || t.operationFailed
    : direct.task?.status === 'unknown' ? t.taskUnknownNote : '';
  byId('deliveryState').textContent = direct.deliveryFailed ? t.deliveryFailed : '';
  byId('sandboxState').textContent = direct.readOnly ? t.codexReadOnly : '';
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
