'use strict';

const path = require('node:path');

const STATE_KEY = 'codexAnyDevice.setup.v1';
const SECRET_KEY = 'codexAnyDevice.qq.appSecret';

function validAppId(value) {
  return typeof value === 'string' && /^\d{6,32}$/.test(value);
}

function validSender(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function validSecret(value) {
  return typeof value === 'string' && /^\S{8,512}$/.test(value);
}

function validProject(value) {
  return value && typeof value.path === 'string' && path.isAbsolute(value.path)
    && !/[\x00-\x1f\x7f]/.test(value.path) && typeof value.name === 'string';
}

function normalizeState(input) {
  const state = { schemaVersion: 1 };
  if (input && validAppId(input.appId)) state.appId = input.appId;
  if (input && validSender(input.senderId)) state.senderId = input.senderId;
  if (input && validProject(input.project)) {
    state.project = { name: input.project.name.slice(0, 160), path: input.project.path };
  }
  return state;
}

function readiness(state, hasSecret) {
  return {
    bot: validAppId(state.appId) && hasSecret,
    identity: validSender(state.senderId),
    project: Boolean(validProject(state.project)),
  };
}

function setupSummary(state) {
  if (!validAppId(state.appId) || !validSender(state.senderId) || !validProject(state.project)) {
    throw new Error('incomplete');
  }
  return {
    channel: 'qq',
    mode: 'direct',
    bot: { appId: state.appId, credentialsStored: true },
    plannedAuthorization: { allowedSenderId: state.senderId, approvalSenderId: state.senderId,
      groups: 'disabled' },
    project: { ...state.project },
    phoneConnection: 'pendingDevelopment',
  };
}

class SetupStore {
  constructor(context) {
    this.context = context;
  }

  read() {
    return normalizeState(this.context.globalState.get(STATE_KEY));
  }

  async hasSecret() {
    return validSecret(await this.context.secrets.get(SECRET_KEY));
  }

  async saveBot(appId, secret) {
    if (!validAppId(appId) || !validSecret(secret)) throw new Error('invalidBot');
    const before = this.read();
    const oldSecret = await this.context.secrets.get(SECRET_KEY);
    const next = { ...before, appId };
    if (before.appId !== appId) delete next.senderId;
    await this.context.secrets.store(SECRET_KEY, secret);
    try {
      await this.context.globalState.update(STATE_KEY, next);
    } catch (error) {
      if (oldSecret === undefined) await this.context.secrets.delete(SECRET_KEY);
      else await this.context.secrets.store(SECRET_KEY, oldSecret);
      throw error;
    }
  }

  async saveSender(senderId) {
    if (!validSender(senderId)) throw new Error('invalidSender');
    if (!readiness(this.read(), await this.hasSecret()).bot) throw new Error('botRequired');
    await this.context.globalState.update(STATE_KEY, { ...this.read(), senderId });
  }

  async saveProject(project) {
    if (!validProject(project)) throw new Error('projectMissing');
    await this.context.globalState.update(STATE_KEY, { ...this.read(), project });
  }

  async clear() {
    // Disable configuration first; a SecretStorage failure cannot leave it ready.
    await this.context.globalState.update(STATE_KEY, { schemaVersion: 1 });
    await this.context.secrets.delete(SECRET_KEY);
  }
}

module.exports = { STATE_KEY, SECRET_KEY, SetupStore, normalizeState, readiness,
  setupSummary, validAppId, validSender, validSecret, validProject };
