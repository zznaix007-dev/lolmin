const fs = require('fs');
const path = require('path');

const storageDir = path.join(__dirname, '..', 'storage', 'records');
fs.mkdirSync(storageDir, { recursive: true });

// PoC recorder: create metadata file for each produced stream.
function startRecording(agentId, producerInfo) {
  const id = `${agentId}-${Date.now()}`;
  const meta = {
    id,
    agentId,
    producer: producerInfo,
    startedAt: new Date().toISOString(),
    status: 'recording',
    path: path.join(storageDir, `${id}.meta.json`)
  };
  fs.writeFileSync(meta.path, JSON.stringify(meta, null, 2));
  return meta;
}

function stopRecording(metaId) {
  const metaPath = path.join(storageDir, `${metaId}.meta.json`);
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.endedAt = new Date().toISOString();
    meta.status = 'stopped';
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }
  return null;
}

module.exports = { startRecording, stopRecording };

