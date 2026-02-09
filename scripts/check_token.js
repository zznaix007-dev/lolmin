const https = require('https');
const token = process.argv[2] || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Token required');
  process.exit(1);
}
const opts = {
  hostname: 'api.github.com',
  path: '/user',
  method: 'GET',
  headers: { 'User-Agent': 'check', Authorization: `token ${token}` }
};
const req = https.request(opts, res => {
  let d='';
  res.on('data', c=> d+=c);
  res.on('end', ()=> {
    console.log('status', res.statusCode);
    try { console.log(JSON.parse(d)); } catch(e) { console.log(d); }
  });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.end();

