// renderer entrypoint: obtains display media and signals to mediasoup via socket.io or signaling server
// This is a minimal skeleton; production must handle reconnection, pinning, and permissions.
(async function () {
  console.log('renderer started');
  const io = require('socket.io-client');
  const mediasoupClient = require('mediasoup-client');
  const SERVER = process.env.SERVER_URL || 'https://localhost:8443';
  const AGENT_KEY = process.env.AGENT_KEY || 'agent-secret';
  const AGENT_ID = process.env.AGENT_ID || require('os').hostname();

  const socket = io(`${SERVER}/mediasoup`, { query: { role: 'agent', agentId: AGENT_ID, key: AGENT_KEY }, secure: true, rejectUnauthorized: false });
  let device = null;
  let sendTransport = null;
  let producer = null;

  socket.on('connect', () => console.log('connected to mediasoup signaling'));
  socket.on('routerRtpCapabilities', async (routerRtpCapabilities) => {
    try {
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities });
      console.log('mediasoup device loaded');
    } catch (e) {
      console.error('device load failed', e);
    }
  });

  if (window.electronAPI && window.electronAPI.onStartStream) {
    window.electronAPI.onStartStream(async () => { await startStream(); });
  } else {
    await startStream();
  }

  async function startStream() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      console.log('Got display stream', stream);
      if (!device) {
        console.warn('device not ready yet, waiting for routerRtpCapabilities');
        // wait briefly
        await new Promise(r => setTimeout(r, 500));
      }
      // create transport on server
      socket.emit('createWebRtcTransport', null, async (err, transportOptions) => {
        if (err) return console.error('createWebRtcTransport failed', err);
        // create send transport
        sendTransport = device.createSendTransport(transportOptions);
        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectTransport', { transportId: sendTransport.id, dtlsParameters }, (e) => {
            if (e) return errback(e);
            callback();
          });
        });
        sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          socket.emit('produce', { transportId: sendTransport.id, kind, rtpParameters }, (err2, { id } = {}) => {
            if (err2) return errback(err2);
            callback({ id });
          });
        });

        // produce video track
        const track = stream.getVideoTracks()[0];
        producer = await sendTransport.produce({ track });
        console.log('producing, id=', producer.id);
      });
    } catch (e) {
      console.error('getDisplayMedia failed', e);
    }
  }
})();

