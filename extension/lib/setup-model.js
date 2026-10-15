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
function validThreadId(value) { return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value); }
function confirmed(state) { return validAppId(state.appId) && state.confirmedAppId === state.appId && validSender(state.senderId) && state.confirmedSender === state.senderId; }
function authorized(state) { return confirmed(state) && validProject(state.project) && state.authorizedProject === state.project.path; }
function revokeProjects(state) {
  state.projects = (state.projects || []).map(({ name, path }) => ({ name, path }));
  for (const key of ['authorizedProject', 'conversationId']) delete state[key];
}
function activateProject(state, project) {
  state.project = { name: project.name, path: project.path };
  delete state.authorizedProject; delete state.conversationId;
  if (confirmed(state) && project.authorized) {
    state.authorizedProject = project.path;
    if (validThreadId(project.conversationId)) state.conversationId = project.conversationId;
  }
  return state;
}

function normalizeState(input) {
  const state = { schemaVersion: 1 };
  if (input && validAppId(input.appId)) state.appId = input.appId;
  if (input && validSender(input.senderId)) state.senderId = input.senderId;
  if (input && validProject(input.project)) {
    state.project = { name: input.project.name.slice(0, 160), path: input.project.path };
  }
  if (state.appId && input?.confirmedAppId === state.appId && input?.confirmedSender === state.senderId && validSender(state.senderId)) {
    state.confirmedSender = state.senderId; state.confirmedAppId = state.appId;
  }
  if (confirmed(state) && state.project && input?.authorizedProject === state.project.path) state.authorizedProject = state.project.path;
  if (authorized(state) && validThreadId(input?.conversationId)) state.conversationId = input.conversationId;
  const projects = [];
  for (const entry of [...(Array.isArray(input?.projects) ? input.projects : []), ...(state.project ? [state.project] : [])]) {
    if (!validProject(entry) || projects.some(project => project.path === entry.path) || projects.length >= 20) continue;
    const project = { name: entry.name.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 160), path: entry.path };
    if (confirmed(state) && (entry.authorized === true || state.authorizedProject === entry.path)) {
      project.authorized = true;
      const target = state.project?.path === entry.path ? state.conversationId || entry.conversationId : entry.conversationId;
      if (validThreadId(target)) project.conversationId = target;
    }
    projects.push(project);
  }
  if (projects.length) state.projects = projects;
  if (state.project) {
    const selected = projects.find(project => project.path === state.project.path);
    if (selected) activateProject(state, selected);
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
    plannedAuthorization: { allowedSenderId: state.senderId, approvalLocation: 'desktop',
      groups: 'disabled', requiresLivePairing: !confirmed(state), projectAuthorized: authorized(state) },
    project: { ...state.project },
    phoneConnection: 'requiresExplicitConnectionAndPairing',
  };
}

class SetupStore {
  constructor(context) {
    this.context = context;
    this.changes = Promise.resolve();
  }
  mutate(change) {
    const pending = this.changes.catch(() => {}).then(() => change(this.read()));
    this.changes = pending; return pending;
  }

  read() {
    return normalizeState(this.context.globalState.get(STATE_KEY));
  }

  async hasSecret() {
    return validSecret(await this.context.secrets.get(SECRET_KEY));
  }

  async saveBot(appId, secret) {
    if (!validAppId(appId) || !validSecret(secret)) throw new Error('invalidBot');
    return this.mutate(async before => {
      const oldSecret = await this.context.secrets.get(SECRET_KEY);
      const next = { ...before, appId };
      if (before.appId !== appId) {
        revokeProjects(next);
        for (const key of ['senderId', 'confirmedSender', 'confirmedAppId']) delete next[key];
      }
      await this.context.secrets.store(SECRET_KEY, secret);
      try {
        await this.context.globalState.update(STATE_KEY, next);
      } catch (error) {
        if (oldSecret === undefined) await this.context.secrets.delete(SECRET_KEY);
        else await this.context.secrets.store(SECRET_KEY, oldSecret);
        throw error;
      }
    });
  }

  async saveSender(senderId) {
    if (!validSender(senderId)) throw new Error('invalidSender');
    return this.mutate(async state => {
      if (!readiness(state, await this.hasSecret()).bot) throw new Error('botRequired');
      const next = { ...state, senderId };
      revokeProjects(next);
      for (const key of ['confirmedSender', 'confirmedAppId', 'authorizedProject', 'conversationId']) delete next[key];
      await this.context.globalState.update(STATE_KEY, next);
    });
  }

  async confirmSender(senderId, valid = () => true) {
    return this.mutate(async state => {
      if (!validSender(senderId) || !validProject(state.project) || !readiness(state, await this.hasSecret()).bot) throw new Error('connectRequired');
      if (!valid()) throw new Error('configurationChanged');
      if (!confirmed(state) || state.senderId !== senderId) revokeProjects(state);
      const projects = (state.projects || []).map(project => project.path === state.project.path
        ? { ...project, authorized: true } : project);
      await this.context.globalState.update(STATE_KEY, { ...state, projects, senderId, confirmedSender: senderId, confirmedAppId: state.appId,
        authorizedProject: state.project.path, conversationId: undefined });
    });
  }
  async authorizeProject(valid = () => true) {
    return this.mutate(async state => {
      if (!confirmed(state) || !validProject(state.project)) throw new Error('connectRequired');
      if (!valid()) throw new Error('configurationChanged');
      await this.context.globalState.update(STATE_KEY, { ...state, authorizedProject: state.project.path,
        projects: state.projects.map(project => project.path === state.project.path ? { ...project, authorized: true } : project) });
    });
  }
  async forgetPairing() {
    return this.mutate(async next => {
      revokeProjects(next);
      for (const key of ['confirmedSender', 'confirmedAppId', 'authorizedProject', 'conversationId']) delete next[key];
      await this.context.globalState.update(STATE_KEY, next);
    });
  }
  async saveConversation(conversationId, valid = () => true) {
    return this.mutate(async state => {
      if (!authorized(state) || !validThreadId(conversationId)) throw new Error('threadMissing');
      if (!valid()) throw new Error('configurationChanged');
      await this.context.globalState.update(STATE_KEY, { ...state, conversationId,
        projects: state.projects.map(project => project.path === state.project.path ? { ...project, conversationId } : project) });
    });
  }

  async saveProject(project) {
    if (!validProject(project)) throw new Error('projectMissing');
    return this.mutate(async state => {
      const projects = state.projects || [];
      const known = projects.find(entry => entry.path === project.path);
      if (!known && projects.length >= 20) throw new Error('projectLimit');
      const entry = { ...known, name: project.name, path: project.path };
      const next = activateProject({ ...state, projects: known ? projects.map(item => item.path === project.path ? entry : item) : [...projects, entry] }, entry);
      await this.context.globalState.update(STATE_KEY, next);
    });
  }
  async switchProject(projectPath, valid = () => true) {
    return this.mutate(async state => {
      const project = state.projects?.find(item => item.path === projectPath);
      if (!confirmed(state) || !project?.authorized) throw new Error('projectUnauthorized');
      if (!valid()) throw new Error('configurationChanged');
      await this.context.globalState.update(STATE_KEY, activateProject(state, project));
    });
  }
  async removeProject(projectPath) {
    return this.mutate(async state => {
      state.projects = (state.projects || []).filter(project => project.path !== projectPath);
      if (state.project?.path === projectPath) {
        delete state.project; delete state.authorizedProject; delete state.conversationId;
        if (state.projects.length) activateProject(state, state.projects[0]);
      }
      await this.context.globalState.update(STATE_KEY, state);
    });
  }

  async clear() {
    return this.mutate(async () => {
      // Disable configuration first; a SecretStorage failure cannot leave it ready.
      await this.context.globalState.update(STATE_KEY, { schemaVersion: 1 });
      await this.context.secrets.delete(SECRET_KEY);
    });
  }
}

module.exports = { STATE_KEY, SECRET_KEY, SetupStore, normalizeState, readiness,
  setupSummary, validAppId, validSender, validSecret, validProject, validThreadId, confirmed, authorized };
