// A small WebSocket server (RFC 6455) built on Node's own http and crypto
// modules, so the game server needs no extra packages. It handles text
// frames, fragmentation, ping/pong, close, message size limits and slow
// readers. Binary frames are accepted and ignored.
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP = { CONT: 0, TEXT: 1, BINARY: 2, CLOSE: 8, PING: 9, PONG: 10 };

export class WsConnection {
  constructor(socket, { maxMessage = 64 * 1024, maxBuffered = 2 * 1024 * 1024, pingEvery = 20000 } = {}) {
    this.socket = socket;
    this.maxMessage = maxMessage;
    this.maxBuffered = maxBuffered;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOp = 0;
    this.fragmentSize = 0;
    this.open = true;
    this.alive = true;
    this.onmessage = null;
    this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.receive(chunk));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    this.pingTimer = setInterval(() => {
      if (!this.alive) { this.terminate(); return; }
      this.alive = false;
      this.frame(OP.PING, Buffer.alloc(0));
    }, pingEvery);
    this.pingTimer.unref?.();
  }

  receive(chunk) {
    if (!this.open) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.open) {
      const frame = this.parse();
      if (!frame) break;
      this.handle(frame);
    }
  }

  /** Reads one complete frame from the buffer, or returns null if more bytes are needed. */
  parse() {
    const b = this.buffer;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let length = b[1] & 0x7f, offset = 2;
    if (length === 126) {
      if (b.length < 4) return null;
      length = b.readUInt16BE(2); offset = 4;
    } else if (length === 127) {
      if (b.length < 10) return null;
      const high = b.readUInt32BE(2), low = b.readUInt32BE(6);
      if (high !== 0) { this.close(1009, 'Too big'); return null; }
      length = low; offset = 10;
    }
    if (!masked) { this.close(1002, 'Frames must be masked'); return null; }
    if (length > this.maxMessage) { this.close(1009, 'Too big'); return null; }
    if (b.length < offset + 4 + length) return null;
    const mask = b.subarray(offset, offset + 4);
    const payload = Buffer.from(b.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    this.buffer = b.subarray(offset + 4 + length);
    return { fin, op, payload };
  }

  handle({ fin, op, payload }) {
    if (op === OP.PING) { this.frame(OP.PONG, payload); return; }
    if (op === OP.PONG) { this.alive = true; return; }
    if (op === OP.CLOSE) { this.close(1000, ''); return; }
    if (op === OP.TEXT || op === OP.BINARY) {
      if (this.fragments.length) { this.close(1002, 'Unfinished message'); return; }
      if (fin) { this.deliver(op, payload); return; }
      this.fragmentOp = op; this.fragments = [payload]; this.fragmentSize = payload.length;
      return;
    }
    if (op === OP.CONT) {
      if (!this.fragments.length) { this.close(1002, 'Unexpected continuation'); return; }
      this.fragmentSize += payload.length;
      if (this.fragmentSize > this.maxMessage) { this.close(1009, 'Too big'); return; }
      this.fragments.push(payload);
      if (!fin) return;
      const whole = Buffer.concat(this.fragments);
      const kind = this.fragmentOp;
      this.fragments = []; this.fragmentSize = 0;
      this.deliver(kind, whole);
      return;
    }
    this.close(1002, 'Unknown frame');
  }

  deliver(op, payload) {
    this.alive = true;
    if (op !== OP.TEXT) return;
    try { this.onmessage?.(payload.toString('utf8')); }
    catch (error) { console.error('message handler failed', error); }
  }

  frame(op, payload) {
    if (!this.open || this.socket.destroyed) return false;
    const length = payload.length;
    const head = length < 126 ? Buffer.alloc(2) : length < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    head[0] = 0x80 | op;
    if (length < 126) head[1] = length;
    else if (length < 65536) { head[1] = 126; head.writeUInt16BE(length, 2); }
    else { head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(length, 6); }
    this.socket.write(Buffer.concat([head, payload]));
    // A reader that cannot keep up is dropped rather than buffered forever.
    if (this.socket.writableLength > this.maxBuffered) { this.terminate(); return false; }
    return true;
  }

  send(text) { return this.frame(OP.TEXT, Buffer.from(text, 'utf8')); }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this.frame(OP.CLOSE, body);
    this.open = false;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref?.();
    this.finish();
  }

  terminate() {
    this.socket.destroy();
    this.finish();
  }

  finish() {
    clearInterval(this.pingTimer);
    this.open = false;
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

/** Completes the HTTP upgrade handshake. Returns a connection, or null when the request is not a WebSocket. */
export function acceptUpgrade(req, socket, head, options) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade ?? '').toLowerCase();
  if (upgrade !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', '',
  ].join('\r\n'));
  const connection = new WsConnection(socket, options);
  if (head?.length) connection.receive(head);
  return connection;
}
