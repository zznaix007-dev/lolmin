// Operator Electron renderer logic — builds on public/client.js but integrates chat and local UI
(function () {
  const loginBtn = document.getElementById('login');
  const pwInput = document.getElementById('pw');
  const usernameInput = document.getElementById('username');
  const watchBtn = document.getElementById('watch');
  const agentInput = document.getElementById('agentId');
  const screenImg = document.getElementById('screen');
  const listBtn = document.getElementById('listProc');
  const procList = document.getElementById('procList');
  const chatDiv = document.getElementById('chat');
  const chatInput = document.getElementById('chatInput');
  const sendChat = document.getElementById('sendChat');
  const serverInput = document.getElementById('server');

  let token = null;
  let opSocket = null;
  let currentAgent = null;
  let peer = null;
  const SimplePeer = require('simple-peer');
  const io = require('socket.io-client');

  loginBtn.onclick = async () => {
    const pw = pwInput.value;
    const username = usernameInput.value;
    const server = serverInput.value;
    const res = await fetch(`${server}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: pw }) });
    if (!res.ok) return alert('login failed');
    const j = await res.json();
    token = j.token;
    alert('login ok');
  };

  watchBtn.onclick = () => {
    const agentId = agentInput.value;
    const server = serverInput.value;
    if (!token) return alert('login first');
    if (opSocket) opSocket.disconnect();
    opSocket = io(`${server}/operator`, { auth: { token }, query: { agentId } });
    currentAgent = agentId;
    opSocket.on('connect_error', (e) => alert('auth error: ' + e.message));
    opSocket.on('frame', ({ image }) => {
      // legacy frames (if agent uses jpeg fallback)
      if (screenImg.tagName === 'IMG') screenImg.src = 'data:image/jpeg;base64,' + image;
    });
    opSocket.on('process:list:response', ({ procs, error }) => {
      procList.innerHTML = '';
      if (error) return alert(error);
      procs.forEach(p => {
        const row = document.createElement('div');
        row.textContent = `${p.image} (${p.pid}) `;
        const btn = document.createElement('button');
        btn.textContent = 'Kill (request)';
        btn.onclick = () => opSocket.emit('process:kill', { agentId: currentAgent, pid: p.pid });
        row.appendChild(btn);
        procList.appendChild(row);
      });
    });
    opSocket.on('chat:message', ({ from, text }) => {
      const el = document.createElement('div');
      el.textContent = `${from}: ${text}`;
      chatDiv.appendChild(el);
    });
    // Use mediasoup for consuming agent producers
    const mediasoupClient = require('mediasoup-client');
    const msSocket = io(`${server}/mediasoup`, { query: { role: 'operator', agentId }, auth: { token } });
    msSocket.on('routerRtpCapabilities', async (routerRtpCapabilities) => {
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities });
      msSocket.emit('createWebRtcTransport', null, async (err, transportOptions) => {
        if (err) return console.error('createWebRtcTransport failed', err);
        recvTransport = device.createRecvTransport(transportOptions);
        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          msSocket.emit('connectTransport', { transportId: recvTransport.id, dtlsParameters }, (e) => {
            if (e) return errback(e);
            callback();
          });
        });
        msSocket.emit('getProducers', { agentId }, async (err2, producerIds = []) => {
          if (err2) return console.error('getProducers error', err2);
          for (const producerId of producerIds) {
            msSocket.emit('consume', { producerId, rtpCapabilities: device.rtpCapabilities }, async (err3, consumerParams) => {
              if (err3) return console.error('consume failed', err3);
              try {
                const consumer = await recvTransport.consume({
                  id: consumerParams.id,
                  producerId: consumerParams.producerId,
                  kind: consumerParams.kind,
                  rtpParameters: consumerParams.rtpParameters
                });
                const stream = new MediaStream();
                stream.addTrack(consumer.track);
                screenImg.srcObject = stream;
                // notify server if resume needed
                msSocket.emit('resumeConsumer', { consumerId: consumer.id }, () => {});
              } catch (e) {
                console.error('consume error', e);
              }
            });
          }
        });
      });
    });
    msSocket.on('newProducer', ({ agentId: aId, producerId }) => {
      if (aId !== agentId) return;
      msSocket.emit('consume', { producerId, rtpCapabilities: device.rtpCapabilities }, async (err3, consumerParams) => {
        if (err3) return console.error('consume failed', err3);
        try {
          const consumer = await recvTransport.consume({
            id: consumerParams.id,
            producerId: consumerParams.producerId,
            kind: consumerParams.kind,
            rtpParameters: consumerParams.rtpParameters
          });
          const stream = new MediaStream();
          stream.addTrack(consumer.track);
          screenImg.srcObject = stream;
          msSocket.emit('resumeConsumer', { consumerId: consumer.id }, () => {});
        } catch (e) {
          console.error('consume error', e);
        }
      });
    });
  };

  listBtn.onclick = () => {
    if (!opSocket) return alert('connect to agent first');
    opSocket.emit('process:list', currentAgent);
  };

  sendChat.onclick = () => {
    const text = chatInput.value;
    if (!opSocket) return alert('connect to agent first');
    opSocket.emit('chat:send', { agentId: currentAgent, text });
    const el = document.createElement('div');
    el.textContent = `You: ${text}`;
    chatDiv.appendChild(el);
    chatInput.value = '';
  };
})();

