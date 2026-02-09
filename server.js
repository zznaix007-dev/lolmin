const fs = require('fs');
const https = require('https');
const express = require('express');
const socketIo = require('socket.io');
const selfsigned = require('selfsigned');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');
const winston = require('winston');

dotenv.config();

const PORT = process.env.SERVER_PORT || 8443;
const OP_PASS = process.env.OPERATOR_PASSWORD || 'change_me';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const AGENT_KEY = process.env.AGENT_KEY || 'agent-secret';

// Simple logger (append-only file)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, 'logs', 'actions.log'), options: { flags: 'a' } }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Ensure logs directory
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });

// Create or load certificate (self-signed) for PoC
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');
const serverCaPath = process.env.SERVER_CA_PATH || path.join(__dirname, 'config', 'certs', 'ca.pem');
let cert, key;
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  cert = fs.readFileSync(certPath);
  key = fs.readFileSync(keyPath);
} else {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  // generate stronger RSA key (>= 2048 bits) to satisfy modern Node TLS requirements
  const pems = selfsigned.generate(attrs, { days: 365, keySize: 4096 });
  cert = pems.cert;
  key = pems.private;
  fs.writeFileSync(certPath, cert);
  fs.writeFileSync(keyPath, key);
}

// mTLS support (optional): if CA exists, require client certs
let httpsOptions = { key, cert };
if (fs.existsSync(serverCaPath)) {
  const ca = fs.readFileSync(serverCaPath);
  httpsOptions = { key, cert, ca, requestCert: true, rejectUnauthorized: true };
  console.log('mTLS enabled: server will require client certificates signed by configured CA');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple login to get operator JWT
app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  // If LDAP configured, use LDAP auth
  if (process.env.USE_LDAP === 'true') {
    try {
      const { authenticate } = require('./auth/ldap');
      const user = await authenticate(username, password);
      // map groups to role (simple mapping)
      const groups = user.groups || [];
      let role = 'readonly';
      if (groups.some(g => g.includes('remote-admin-admins'))) role = 'admin';
      else if (groups.some(g => g.includes('remote-admin-ops'))) role = 'operator';
      const token = jwt.sign({ role, user: username }, JWT_SECRET, { expiresIn: '8h' });
      logger.info({ event: 'operator_login', user: username, method: 'ldap', time: Date.now() });
      return res.json({ token });
    } catch (e) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  // fallback: simple password check (PoC)
  const { password: pw } = req.body || {};
  if (pw !== OP_PASS) return res.status(401).json({ error: 'unauthorized' });
  const token = jwt.sign({ role: 'operator' }, JWT_SECRET, { expiresIn: '8h' });
  logger.info({ event: 'operator_login', time: Date.now() });
  res.json({ token });
});

const server = https.createServer(httpsOptions, app);
const io = socketIo(server, { cors: { origin: '*' } });

// mediasoup (initialized lazily)
try {
  const { initMediasoup } = require('./server/mediasoup');
  initMediasoup(io, server, app).catch(err => console.warn('mediasoup init failed (dev):', err && err.message));
} catch (e) {
  console.warn('mediasoup module not available. Run `npm install mediasoup` to enable WebRTC features.');
}

// Namespaces: /agent and /operator
const agents = new Map(); // agentId -> socket

io.of('/agent').on('connection', (socket) => {
  const key = socket.handshake.query.key;
  const agentId = socket.handshake.query.id || socket.id;
  if (key !== AGENT_KEY) {
    logger.info({ event: 'invalid_agent_key', agentId, providedKey: key, time: Date.now() });
    socket.emit('error', 'invalid_agent_key');
    socket.disconnect(true);
    return;
  }
  agents.set(agentId, socket);
  logger.info({ event: 'agent_connect', agentId, time: Date.now() });
  console.log(`Agent connected: ${agentId}`);

  socket.on('frame', (data) => {
    // broadcast to operators subscribed to this agent
    io.of('/operator').to(agentId).emit('frame', { agentId, image: data });
    logger.info({ event: 'frame', agentId, size: (data && data.length) || 0, time: Date.now() });
    // Save frame to storage/records for simple recording
    try {
      const storageDir = path.join(__dirname, 'storage', 'records', agentId || 'unknown');
      fs.mkdirSync(storageDir, { recursive: true });
      const filename = path.join(storageDir, `${Date.now()}.jpg`);
      fs.writeFileSync(filename, Buffer.from(data, 'base64'));
    } catch (e) {
      logger.info({ event: 'frame_save_error', agentId, error: e && e.message });
    }
  });

  socket.on('webrtc:signal', ({ signal }) => {
    // forward to operators watching this agent
    io.of('/operator').to(agentId).emit('webrtc:signal', { signal });
    logger.info({ event: 'webrtc_signal_from_agent', agentId, time: Date.now() });
  });

  socket.on('process:list:response', (payload) => {
    io.of('/operator').to(agentId).emit('process:list:response', payload);
    logger.info({ event: 'process_list_response', agentId, payload, time: Date.now() });
  });

  socket.on('disconnect', () => {
    agents.delete(agentId);
    logger.info({ event: 'agent_disconnect', agentId, time: Date.now() });
    console.log(`Agent disconnected: ${agentId}`);
  });
});

// Operator namespace — require JWT
io.of('/operator').use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'operator') throw new Error('not operator');
    // attach decoded info for per-socket checks
    socket.data = socket.data || {};
    socket.data.decoded = decoded;
    return next();
  } catch (e) {
    return next(new Error('unauthorized'));
  }
});

io.of('/operator').on('connection', (socket) => {
  const { agentId } = socket.handshake.query;
  if (agentId) socket.join(agentId); // operator watches specific agent
  socket.on('watch:agent', (agentId) => {
    socket.join(agentId);
    logger.info({ event: 'operator_watch', agentId, time: Date.now() });
  });

  // Relay requests from operator to agent
  socket.on('process:list', (agentId) => {
    const a = agents.get(agentId);
    if (a) a.emit('process:list');
  });

  socket.on('process:kill', ({ agentId, pid }) => {
    const decoded = socket.data && socket.data.decoded;
    const role = decoded && decoded.role;
    if (!role || (role !== 'operator' && role !== 'admin')) {
      logger.info({ event: 'operator_kill_forbidden', agentId, pid, role, time: Date.now() });
      socket.emit('error', 'forbidden');
      return;
    }
    const a = agents.get(agentId);
    if (a) a.emit('process:kill', { pid });
    logger.info({ event: 'operator_kill_request', agentId, pid, role, time: Date.now() });
  });
  socket.on('chat:send', ({ agentId, text }) => {
    const decoded = socket.data && socket.data.decoded;
    const from = decoded && decoded.user ? decoded.user : 'operator';
    const a = agents.get(agentId);
    if (a) a.emit('chat:message', { from, text });
    logger.info({ event: 'operator_chat', agentId, from, text, time: Date.now() });
  });
  socket.on('webrtc:signal', ({ agentId, signal }) => {
    // operator -> agent
    const a = agents.get(agentId);
    if (a) a.emit('webrtc:signal', { signal });
  });
  // file transfer relay: operator -> server -> agent
  socket.on('file:send', ({ agentId, filename, data }) => {
    const decoded = socket.data && socket.data.decoded;
    const from = decoded && decoded.user ? decoded.user : 'operator';
    const a = agents.get(agentId);
    if (a) {
      a.emit('file:receive', { filename, data, from });
      logger.info({ event: 'file_sent', agentId, filename, from, time: Date.now() });
    } else {
      socket.emit('error', 'agent_offline');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
  logger.info({ event: 'server_start', port: PORT, time: Date.now() });
});

