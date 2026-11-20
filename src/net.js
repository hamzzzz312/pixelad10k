import Peer from 'peerjs';

// Mabar memakai WebRTC P2P: satu pemain jadi host (room), yang lain menyambung
// lewat kode room. Broker PeerJS publik cuma dipakai untuk "kenalan" awal,
// semua data game mengalir langsung antar browser.

const NS = 'bloxcraft-v1-';
const PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

// Batas waktu membuka koneksi ke server signaling (broker PeerJS).
const OPEN_TIMEOUT = 12000;
const SIGNALING_TIMEOUT_MSG =
  'Tidak bisa menyambung ke server P2P. Cek internet kamu, lalu coba lagi.';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(len = 5) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

function describeError(err) {
  const type = err?.type || '';
  if (type === 'unavailable-id') return 'Kode room sudah dipakai. Coba buat room lagi.';
  if (type === 'peer-unavailable') return 'Room tidak ditemukan. Cek lagi kodenya ya.';
  if (type === 'browser-incompatible') return 'Browser ini tidak mendukung WebRTC.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') {
    return 'Gagal menyambung ke jaringan. Cek internet kamu lalu coba lagi.';
  }
  if (type) return 'Koneksi gagal (' + type + '). Coba lagi.';
  return err?.message ? String(err.message) : 'Koneksi gagal. Coba lagi.';
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.selfId = null;
    this.code = null;
    this.conns = new Map();
    this.socket = null;
    this.handlers = new Map();
    this.getSnapshot = null;
    this.closed = false;
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    return this;
  }

  emit(event, ...args) {
    for (const fn of this.handlers.get(event) || []) {
      try {
        fn(...args);
      } catch (err) {
        console.error('[net] handler error', err);
      }
    }
  }

  /* ------------------------- host ------------------------- */

  async host({ code, name, getSnapshot }) {
    this.isHost = true;
    this.code = code;
    this.name = name;
    this.getSnapshot = getSnapshot;

    const peer = new Peer(NS + code, PEER_OPTS);
    this.peer = peer;
    this.selfId = NS + code;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(SIGNALING_TIMEOUT_MSG));
      }, OPEN_TIMEOUT);

      const fail = (err) => {
        if (settled) {
          this.emit('error', err);
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(new Error(describeError(err)));
      };

      peer.on('open', (id) => {
        settled = true;
        clearTimeout(timer);
        this.selfId = id;
        resolve({ code });
      });
      peer.on('error', (err) => {
        console.warn('[net] host error', err);
        fail(err);
      });
      peer.on('connection', (conn) => this.acceptConnection(conn));
      peer.on('disconnected', () => {
        if (!this.closed) {
          try {
            peer.reconnect();
          } catch {
            /* ignore */
          }
        }
      });
    });
  }

  acceptConnection(conn) {
    const name = conn.metadata?.name || 'Pemain';
    let opened = false;

    const onOpen = () => {
      if (this.closed || opened) return;
      opened = true;
      this.conns.set(conn.peer, conn);
      const snap = this.getSnapshot ? this.getSnapshot() : { seed: 1, edits: [], players: [] };
      conn.send({ t: 'init', seed: snap.seed, edits: snap.edits, players: snap.players });
      this.broadcast({ t: 'join', id: conn.peer, name }, conn.peer);
      this.emit('join', conn.peer, name);
    };

    if (conn.open) onOpen();
    else conn.on('open', onOpen);

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'state') {
        this.emit('state', conn.peer, msg);
        this.broadcast({ t: 'state', id: conn.peer, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch, name }, conn.peer);
      } else if (msg.t === 'edit') {
        this.emit('edit', msg);
        this.broadcast(msg, conn.peer);
      }
    });

    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.emit('leave', conn.peer);
      this.broadcast({ t: 'leave', id: conn.peer });
    });

    conn.on('error', (err) => console.warn('[net] conn error', err));
  }

  broadcast(msg, exceptId) {
    for (const [id, conn] of this.conns) {
      if (id === exceptId) continue;
      try {
        if (conn.open) conn.send(msg);
      } catch (err) {
        console.warn('[net] send failed', err);
      }
    }
  }

  /* ------------------------- client ------------------------- */

  async join({ code, name }) {
    this.isHost = false;
    this.code = code;
    this.name = name;

    const peer = new Peer(undefined, PEER_OPTS);
    this.peer = peer;

    // Jangan pernah menggantung di sini: kalau broker tidak bisa dihubungi,
    // lempar error supaya menu bisa dipakai lagi.
    const selfId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(SIGNALING_TIMEOUT_MSG)), OPEN_TIMEOUT);
      peer.on('open', (id) => {
        clearTimeout(timer);
        resolve(id);
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(describeError(err)));
      });
    });
    this.selfId = selfId;

    const conn = peer.connect(NS + code, { metadata: { name }, reliable: true });
    this.socket = conn;

    const init = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Room tidak merespons. Pastikan host masih membuka game dan kodenya benar.')),
        15000
      );
      // PeerJS melempar error berupa objek Error dengan properti `type`, jadi
      // selalu normalisasi lewat describeError agar pesannya berbahasa Indonesia.
      const fail = (err) => {
        clearTimeout(timer);
        reject(new Error(describeError(err)));
      };

      conn.on('open', () => clearTimeout(timer));
      conn.on('data', (msg) => {
        if (msg?.t === 'init') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      conn.on('error', fail);
      peer.on('error', fail);
    });

    conn.on('data', (msg) => this.handleMessage(msg));
    conn.on('close', () => this.emit('closed'));
    peer.on('error', (err) => this.emit('error', err));

    return init;
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'state') this.emit('state', msg.id, msg);
    else if (msg.t === 'edit') this.emit('edit', msg);
    else if (msg.t === 'join') this.emit('join', msg.id, msg.name);
    else if (msg.t === 'leave') this.emit('leave', msg.id);
  }

  /* ------------------------- kirim data ------------------------- */

  sendState(state) {
    const msg = { t: 'state', x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch };
    if (this.isHost) {
      this.broadcast({ ...msg, id: this.selfId, name: this.name });
    } else if (this.socket?.open) {
      try {
        this.socket.send(msg);
      } catch (err) {
        console.warn('[net] send state failed', err);
      }
    }
  }

  sendEdit(x, y, z, i) {
    const msg = { t: 'edit', x, y, z, i };
    if (this.isHost) {
      this.broadcast(msg);
    } else if (this.socket?.open) {
      try {
        this.socket.send(msg);
      } catch (err) {
        console.warn('[net] send edit failed', err);
      }
    }
  }

  get playerCount() {
    return this.isHost ? this.conns.size + 1 : 1;
  }

  destroy() {
    this.closed = true;
    for (const conn of this.conns.values()) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.conns.clear();
    try {
      this.socket?.close();
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
  }
}
