const io = require('socket.io-client');
const screenshot = require('screenshot-desktop');
const notifier = require('node-notifier');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

dotenv.config();

const SERVER = process.env.SERVER_URL || 'https://localhost:8443';
const AGENT_KEY = process.env.AGENT_KEY || 'agent-secret';
const AGENT_ID = process.env.AGENT_ID || require('os').hostname();

const consentFlag = process.argv.includes('--consent');
if (!consentFlag) {
  console.error('Agent must be started with --consent to indicate local user consent.');
  process.exit(1);
}

// Optionally load client certs for mTLS
let transportOptions = {};
try {
  const agentCertPath = process.env.AGENT_CERT_PATH;
  const agentKeyPath = process.env.AGENT_KEY_PATH;
  const serverCaPath = process.env.SERVER_CA_PATH;
  if (agentCertPath && agentKeyPath && serverCaPath && fs.existsSync(agentCertPath) && fs.existsSync(agentKeyPath) && fs.existsSync(serverCaPath)) {
    const httpsAgent = new (require('https').Agent)({
      cert: fs.readFileSync(agentCertPath),
      key: fs.readFileSync(agentKeyPath),
      ca: fs.readFileSync(serverCaPath),
      rejectUnauthorized: true
    });
    transportOptions = { transportOptions: { websocket: { agent: httpsAgent } } };
    console.log('Using client certificates for mTLS connection');
  }
} catch (e) {
  console.warn('Failed to load client certs for mTLS', e && e.message);
}

const socket = io(`${SERVER}/agent`, Object.assign({
  secure: true,
  rejectUnauthorized: false,
  query: { key: AGENT_KEY, id: AGENT_ID }
}, transportOptions));

socket.on('connect', () => {
  console.log('Connected to server as agent:', AGENT_ID);
  notifier.notify({ title: 'RemoteAdmin Agent', message: 'Agent connected to server (consent given).' });
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Periodically capture screenshot and send as JPEG base64
setInterval(async () => {
  try {
    const img = await screenshot({ format: 'jpg' });
    const b64 = img.toString('base64');
    socket.emit('frame', b64);
  } catch (e) {
    console.error('screenshot error', e.message);
  }
}, 2000);

// Process list and kill handlers
const whitelistPath = path.join(__dirname, 'whitelist.json');
let whitelist = [];
try {
  whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
} catch (e) {
  whitelist = [];
}

socket.on('process:list', () => {
  exec('tasklist /FO CSV /NH', (err, stdout) => {
    if (err) {
      socket.emit('process:list:response', { error: err.message });
      return;
    }
    // Parse CSV rows: "Image Name","PID",...
    const lines = stdout.trim().split(/\r?\n/).map(l => l.replace(/(^"|"$)/g, ''));
    const procs = lines.map(line => {
      const cols = line.split('","');
      return { image: cols[0], pid: parseInt(cols[1], 10) };
    });
    socket.emit('process:list:response', { procs });
  });
});

socket.on('process:kill', ({ pid }) => {
  // Validate against whitelist by resolving process name first
  exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (err, stdout) => {
    if (err) {
      socket.emit('process:kill:response', { error: err.message });
      return;
    }
    const cols = stdout.replace(/(^"|"$)/g, '').split('","');
    const image = cols[0];
    if (!whitelist.includes(image)) {
      socket.emit('process:kill:response', { error: 'process not allowed to be killed by policy', image, pid });
      return;
    }
    // Ask for local user confirmation via PowerShell MessageBox
    try {
      const promptCmd = `Add-Type -AssemblyName System.Windows.Forms; $r=[System.Windows.Forms.MessageBox]::Show('Allow remote operator to kill process ${image} (PID ${pid})?','RemoteAdmin - Confirm',[System.Windows.Forms.MessageBoxButtons]::YesNo); Write-Output $r`;
      const spawn = require('child_process').spawnSync;
      const ps = spawn('powershell', ['-NoProfile', '-Command', promptCmd], { encoding: 'utf8' });
      const out = (ps.stdout || '').toString();
      if (out.toLowerCase().includes('yes')) {
        exec(`taskkill /PID ${pid} /T /F`, (ke, kout) => {
          if (ke) {
            socket.emit('process:kill:response', { error: ke.message });
            return;
          }
          socket.emit('process:kill:response', { success: true, image, pid });
        });
      } else {
        socket.emit('process:kill:response', { error: 'local_user_denied', image, pid });
      }
    } catch (e) {
      socket.emit('process:kill:response', { error: 'confirmation_failed', detail: e && e.message });
    }
  });
});

socket.on('chat:message', ({ from, text }) => {
  console.log(`Chat from ${from}: ${text}`);
  try {
    notifier.notify({ title: `Chat from ${from}`, message: text });
  } catch (e) {
    // ignore
  }
});

socket.on('file:receive', ({ filename, data, from }) => {
  try {
    const targetDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'RemoteAdmin', 'received');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, path.basename(filename));
    fs.writeFileSync(targetPath, Buffer.from(data, 'base64'));
    socket.emit('file:receive:response', { success: true, path: targetPath });
    notifier.notify({ title: 'RemoteAdmin', message: `Received file ${filename} from ${from}` });
  } catch (e) {
    socket.emit('file:receive:response', { error: e && e.message });
  }
});

