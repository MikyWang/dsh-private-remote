// Minimal RFC 6455 client for the Gateway mux (test-only).
import net from 'node:net';
import crypto from 'node:crypto';

function connect(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(Number(u.port), u.hostname);
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    const listeners = new Set();
    const send = (text) => {
      const payload = Buffer.from(text);
      const mask = crypto.randomBytes(4);
      const len = payload.length;
      let header;
      if (len < 126) { header = Buffer.from([0x81, 0x80 | len]); }
      else if (len < 65536) { header = Buffer.alloc(4); header[0]=0x81; header[1]=0x80|126; header.writeUInt16BE(len,2); }
      else { header = Buffer.alloc(10); header[0]=0x81; header[1]=0x80|127; header.writeBigUInt64BE(BigInt(len),2); }
      const masked = Buffer.from(payload);
      for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
      socket.write(Buffer.concat([header, mask, masked]));
    };
    const close = () => { try { socket.end(); } catch {} };
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 4);
        const status = Number(head.split(' ')[1]);
        if (status !== 101) { reject(new Error(`upgrade failed: ${head.split('\r\n')[0]}`)); return; }
        upgraded = true;
        resolve({ send, close, on: (fn) => listeners.add(fn) });
      }
      while (buffer.length >= 2) {
        const fin = (buffer[0] & 0x80) !== 0;
        const opcode = buffer[0] & 0x0f;
        const masked = (buffer[1] & 0x80) !== 0;
        let len = buffer[1] & 0x7f;
        let offset = 2;
        if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
        else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
        const maskOffset = offset;
        if (masked) offset += 4;
        if (buffer.length < offset + len) return;
        let payload = buffer.subarray(offset, offset + len);
        if (masked) { payload = Buffer.from(payload); for (let i=0;i<payload.length;i++) payload[i] ^= buffer[maskOffset + (i%4)]; }
        buffer = buffer.subarray(offset + len);
        if (opcode === 1) for (const fn of listeners) fn(payload.toString());
        else if (opcode === 8) { for (const fn of listeners) fn(null); close(); }
        else if (opcode === 9) { /* ping */ }
      }
    });
    socket.on('error', reject);
    socket.on('connect', () => {
      const lines = [
        `GET ${u.pathname}${u.search} HTTP/1.1`,
        `Host: ${u.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        ...Object.entries(headers).map(([k,v]) => `${k}: ${v}`),
      ];
      socket.write(lines.join('\r\n') + '\r\n\r\n');
    });
  });
}

export { connect };
