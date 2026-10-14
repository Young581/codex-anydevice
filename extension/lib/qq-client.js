'use strict';

const { EventEmitter } = require('node:events');
const { validAppId, validSecret, validSender } = require('./setup-model');

const API = 'https://api.bot.qq.com';
const TOKEN_URL = API + '/app/getAppAccessToken';
// Tencent's API-v2 examples and official botpy tests use these exact hosts.
// Keep REST/token traffic on API; never trust arbitrary QQ subdomains for Identify.
const GATEWAY_HOSTS = new Set(['api.bot.qq.com', 'api.sgroup.qq.com']);
const MAX_BODY = 256 * 1024;

class QqClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.fetch = options.fetch || globalThis.fetch;
    this.WebSocket = options.WebSocket || globalThis.WebSocket;
    this.now = options.now || Date.now;
    this.status = 'disconnected'; this.stopped = true;
    this.epoch = 0; this.retries = 0; this.sequence = null;
    this.session = undefined; this.token = undefined; this.replySequences = new Map();
  }

  state(value) { this.status = value; this.emit('state', value); }

  async json(url, options = {}) {
    // Credentials never follow redirects or leave the official origin.
    if (!url.startsWith(API + '/')) throw new Error('qqEndpoint');
    const response = await this.fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'qqDenied' : 'qqNetwork');
    const length = Number(response.headers?.get('content-length'));
    if (length > MAX_BODY) throw new Error('qqProtocol');
    const reader = response.body?.getReader(); let body = '';
    if (reader) {
      let size = 0; const chunks = [];
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) { await reader.cancel(); throw new Error('qqProtocol'); }
        chunks.push(Buffer.from(value));
      }
      body = Buffer.concat(chunks).toString('utf8');
    } else { body = await response.text(); if (Buffer.byteLength(body) > MAX_BODY) throw new Error('qqProtocol'); }
    let value; try { value = JSON.parse(body); } catch { throw new Error('qqProtocol'); }
    if (!value || typeof value !== 'object') throw new Error('qqProtocol');
    if (value.code && value.code !== 0) throw new Error('qqDenied');
    return value;
  }

  async authenticate(epoch) {
    if (this.token && this.expiresAt - this.now() > 45000) return;
    const value = await this.json(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.appId, clientSecret: this.secret }) });
    if (this.stopped || epoch !== this.epoch) throw new Error('qqStopped');
    const lifetime = Number(value.expires_in);
    if (typeof value.access_token !== 'string' || !value.access_token || !Number.isFinite(lifetime) || lifetime < 60 || lifetime > 7200) {
      throw new Error('qqProtocol');
    }
    this.token = value.access_token; this.expiresAt = this.now() + lifetime * 1000;
  }

  async start(appId, secret) {
    if (!validAppId(appId) || !validSecret(secret) || !this.WebSocket || !this.fetch) throw new Error('qqRuntime');
    this.stop(); this.stopped = false; this.appId = appId; this.secret = secret;
    const epoch = this.epoch;
    try { await this.connect(epoch); } catch (error) { this.stop(); throw error; }
  }

  async connect(epoch) {
    this.state('connecting'); await this.authenticate(epoch);
    const gateway = await this.json(API + '/gateway/bot', { headers: { Authorization: 'QQBot ' + this.token } });
    if (this.stopped || epoch !== this.epoch) return;
    let url; try { url = new URL(gateway.url); } catch { throw new Error('qqProtocol'); }
    if (url.protocol !== 'wss:' || url.port || url.username || url.password) throw new Error('qqEndpointTransport');
    if (!GATEWAY_HOSTS.has(url.hostname)) throw new Error('qqEndpointHost');
    if (!/^\/websocket\/?$/.test(url.pathname)) throw new Error('qqEndpointPath');
    if (url.search || url.hash) throw new Error('qqEndpointOptions');
    if (gateway.shards && gateway.shards !== 1) throw new Error('qqShards');
    if (gateway.session_start_limit?.remaining === 0 && !this.session) throw new Error('qqDenied');
    const socket = new this.WebSocket(url.href); this.socket = socket;
    clearTimeout(this.handshake);
    this.handshake = setTimeout(() => this.reconnect(socket, epoch), 15000);
    socket.addEventListener('message', event => {
      if (socket !== this.socket || epoch !== this.epoch || this.stopped) return;
      try { this.receive(event.data, socket, epoch); } catch { this.reconnect(socket, epoch); }
    });
    socket.addEventListener('error', () => this.reconnect(socket, epoch));
    socket.addEventListener('close', event => {
      if (socket !== this.socket || epoch !== this.epoch || this.stopped) return;
      if ([4004, 4013, 4014].includes(event.code)) { this.stop(); this.state('qqDenied'); }
      else this.reconnect(socket, epoch);
    });
  }

  send(payload) {
    if (this.socket?.readyState !== 1) throw new Error('qqNetwork');
    this.socket.send(JSON.stringify(payload));
  }

  heartbeat(socket, epoch) {
    if (socket !== this.socket || epoch !== this.epoch || this.stopped) return;
    if (this.awaitingAck) { this.reconnect(socket, epoch); return; }
    this.awaitingAck = true; this.send({ op: 1, d: this.sequence });
  }

  receive(raw, socket, epoch) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BODY) throw new Error('qqProtocol');
    const message = JSON.parse(raw);
    if (message.op === 0 && Number.isSafeInteger(message.s)) this.sequence = message.s;
    if (message.op === 10) {
      const interval = message.d?.heartbeat_interval;
      if (!Number.isInteger(interval) || interval < 1000 || interval > 300000) throw new Error('qqProtocol');
      clearInterval(this.heart); this.awaitingAck = false;
      this.send(this.session && this.sequence !== null
        ? { op: 6, d: { token: 'QQBot ' + this.token, session_id: this.session, seq: this.sequence } }
        : { op: 2, d: { token: 'QQBot ' + this.token, intents: 1 << 25, shard: [0, 1], properties: {} } });
      this.heart = setInterval(() => this.heartbeat(socket, epoch), interval);
    } else if (message.op === 11) this.awaitingAck = false;
    else if (message.op === 1) { this.send({ op: 1, d: this.sequence }); this.awaitingAck = true; }
    else if (message.op === 7 || message.op === 9) {
      if (message.op === 9) { this.session = undefined; this.sequence = null; }
      this.reconnect(socket, epoch);
    } else if (message.op === 0) {
      if (message.t === 'READY' || message.t === 'RESUMED') {
        if (message.t === 'READY') {
          if (typeof message.d?.session_id !== 'string' || !message.d.session_id || message.d.session_id.length > 512) throw new Error('qqProtocol');
          this.session = message.d.session_id;
        }
        clearTimeout(this.handshake); this.retries = 0; this.state('connected');
        clearTimeout(this.refresh);
        this.refresh = setTimeout(() => {
          this.token = undefined; this.reconnect(socket, epoch);
        }, Math.max(1000, this.expiresAt - this.now() - 40000));
      } else if (message.t === 'C2C_MESSAGE_CREATE') {
        const data = message.d;
        const at = Date.parse(data?.timestamp);
        if (this.status !== 'connected' || !validSender(data?.author?.user_openid) || data.author.bot
          || typeof data.id !== 'string' || !data.id || data.id.length > 512 || typeof data.content !== 'string'
          || data.content.length > 12000 || !Number.isFinite(at) || at > this.now() + 60000
          || this.now() - at > 5 * 60000 || (data.message_type !== undefined && data.message_type !== 0)) return;
        this.emit('message', { id: data.id, sender: data.author.user_openid, text: data.content.trim(), at });
      }
    }
  }

  reconnect(socket, epoch) {
    if (this.stopped || epoch !== this.epoch || socket !== this.socket) return;
    this.socket = undefined; clearInterval(this.heart); clearTimeout(this.handshake); clearTimeout(this.refresh);
    try { socket.close(); } catch { /* Already closed. */ }
    if (++this.retries > 6) { this.stop(); this.state('qqNetwork'); return; }
    this.state('reconnecting');
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(epoch).catch(() => {
      if (!this.stopped && epoch === this.epoch) {
        // Retain retry state without emitting server bodies or credentials.
        this.socket = { close() {} }; this.reconnect(this.socket, epoch);
      }
    }), Math.min(30000, 1000 * 2 ** (this.retries - 1)));
  }

  async reply(message, text) {
    const epoch = this.epoch;
    if (this.stopped || !validSender(message.sender) || typeof message.id !== 'string' || !message.id
      || !Number.isSafeInteger(message.at) || message.at > this.now() + 60000
      || this.now() - message.at > 5 * 60000) throw new Error('qqReplyExpired');
    for (const [key, value] of this.replySequences) if (this.now() - value.at > 5 * 60000) this.replySequences.delete(key);
    const key = message.sender + ':' + message.id;
    if (!this.replySequences.has(key) && this.replySequences.size >= 512) throw new Error('qqReplyLimit');
    const sequence = (this.replySequences.get(key)?.sequence || 0) + 1;
    if (sequence > 4) throw new Error('qqReplyLimit');
    this.replySequences.set(key, { sequence, at: message.at });
    await this.authenticate(epoch);
    if (this.stopped || epoch !== this.epoch) throw new Error('qqStopped');
    const result = await this.json(API + '/v2/users/' + encodeURIComponent(message.sender) + '/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'QQBot ' + this.token },
      body: JSON.stringify({ msg_type: 0, content: String(text).slice(0, 1800), msg_id: message.id, msg_seq: sequence }),
    });
    if (typeof result.id !== 'string') throw new Error('qqProtocol');
  }

  stop() {
    this.stopped = true; this.epoch++;
    for (const timer of [this.heart, this.handshake, this.refresh, this.retry]) { clearTimeout(timer); clearInterval(timer); }
    const socket = this.socket; this.socket = undefined;
    try { socket?.close(); } catch { /* Already closed. */ }
    this.session = undefined; this.sequence = null; this.token = undefined; this.secret = undefined;
    this.replySequences.clear(); this.state('disconnected');
  }
}

module.exports = { QqClient, API };
