const fs = require('fs');
const path = require('path');
const https = require('https');

const token = process.argv[2] || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB token required as arg or env var');
  process.exit(1);
}
let owner = 'zznaix007';
const repo = 'lolmin';
const root = path.resolve('c:/Users/CS/lolrat');

function request(method, apiPath, body) {
  const opts = {
    hostname: 'api.github.com',
    path: apiPath,
    method,
    headers: {
      'User-Agent': 'upload-script',
      Authorization: `token ${token}`,
      'Content-Type': 'application/json'
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  try {
    console.log('Create repo...');
    // determine authenticated user login to use as owner
    const user = await request('GET', '/user', null);
    if (user && user.login) {
      owner = user.login;
      console.log('Authenticated as', owner);
    }
    await request('POST', '/user/repos', { name: repo, private: false, description: 'Remote-admin PoC and hardened skeleton' });
  } catch (e) {
    console.warn('Repo creation may have failed or already exists:', e.message);
  }

  const exclude = ['\\node_modules\\', '\\dist\\', '\\storage\\', '\\logs\\', '\\.git\\', '\\agent-electron\\dist\\', '\\operator-electron\\dist\\'];
  function shouldSkip(full) {
    const f = full.toLowerCase();
    return exclude.some(ex => f.includes(ex));
  }

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (shouldSkip(full)) continue;
      if (e.isFile()) files.push(full);
      else if (e.isDirectory()) files = files.concat(walk(full));
    }
    return files;
  }

  const files = walk(root);
  console.log('Files to upload:', files.length);
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const content = fs.readFileSync(f);
    const b64 = content.toString('base64');
    const body = { message: `Add ${rel}`, content: b64 };
    const apiPath = `/repos/${owner}/${repo}/contents/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
    try {
      await request('PUT', apiPath, body);
      console.log('Uploaded', rel);
    } catch (e) {
      console.warn('Failed', rel, e.message);
    }
  }
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });

