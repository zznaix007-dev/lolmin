(async function () {
  const loginBtn = document.getElementById('login');
  const pwInput = document.getElementById('pw');
  const watchBtn = document.getElementById('watch');
  const agentInput = document.getElementById('agentId');
  const screenImg = document.getElementById('screen');
  const listBtn = document.getElementById('listProc');
  const procList = document.getElementById('procList');

  let token = null;
  let opSocket = null;

  loginBtn.onclick = async () => {
    const pw = pwInput.value;
    const username = document.getElementById('username').value;
    const res = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: pw }) });
    if (!res.ok) return alert('login failed');
    const j = await res.json();
    token = j.token;
    alert('login ok');
  };

  watchBtn.onclick = () => {
    const agentId = agentInput.value;
    if (!token) return alert('login first');
    if (opSocket) opSocket.disconnect();
    opSocket = io('/operator', { auth: { token }, query: { agentId } });
    opSocket.on('connect_error', (e) => alert('auth error: ' + e.message));
    opSocket.on('frame', ({ image }) => {
      screenImg.src = 'data:image/jpeg;base64,' + image;
    });
    opSocket.on('process:list:response', ({ procs, error }) => {
      procList.innerHTML = '';
      if (error) return alert(error);
      procs.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.image} (${p.pid}) `;
        const btn = document.createElement('button');
        btn.textContent = 'Kill (request)';
        btn.onclick = () => {
          // send kill request
          opSocket.emit('process:kill', { agentId, pid: p.pid });
        };
        li.appendChild(btn);
        procList.appendChild(li);
      });
    });
  };

  listBtn.onclick = () => {
    const agentId = agentInput.value;
    if (!opSocket) return alert('connect to agent first');
    opSocket.emit('process:list', agentId);
  };
})();

