const os = require('os');
const mediasoup = require('mediasoup');
const fs = require('fs');
const path = require('path');

let worker = null;
let router = null;

async function createWorker() {
  const workerOpts = {
    rtcMinPort: 40000,
    rtcMaxPort: 40100,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
  };
  worker = await mediasoup.createWorker(workerOpts);
  worker.on('died', () => {
    console.error('mediasoup worker died, exiting');
    process.exit(1);
  });
  return worker;
}

async function initMediasoup(io, server, app) {
  // create worker and router
  worker = await createWorker();
  router = await worker.createRouter({ mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 }
  ]});

  // simple namespace for mediasoup signaling
  const ns = io.of('/mediasoup');
  // Keep track of transports/producers per socket/agent
  const producerMap = new Map(); // producerId -> { agentId, socketId }
  const agentProducers = new Map(); // agentId -> Set of producerIds
  const consumers = new Map(); // consumerId -> consumer

  ns.on('connection', (socket) => {
    console.log('mediasoup signaling connected:', socket.id);
    const role = socket.handshake.query.role || 'unknown';
    const agentId = socket.handshake.query.agentId || socket.handshake.query.id || null;

    // send router rtp caps on connect
    socket.emit('routerRtpCapabilities', router.rtpCapabilities);

    socket.on('createWebRtcTransport', async (data, cb) => {
      try {
        const transport = await router.createWebRtcTransport({
          listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true
        });
        // store transport on socket
        socket._mediasoupTransport = socket._mediasoupTransport || {};
        socket._mediasoupTransport[transport.id] = transport;
        cb(null, {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        });
      } catch (e) {
        cb(e.message);
      }
    });

    socket.on('connectTransport', async ({ transportId, dtlsParameters }, cb) => {
      try {
        const transport = socket._mediasoupTransport && socket._mediasoupTransport[transportId];
        if (!transport) return cb('transport_not_found');
        await transport.connect({ dtlsParameters });
        cb(null);
      } catch (e) {
        cb(e.message);
      }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters }, cb) => {
      try {
        const transport = socket._mediasoupTransport && socket._mediasoupTransport[transportId];
        if (!transport) return cb('transport_not_found');
        const producer = await transport.produce({ kind, rtpParameters });
        producerMap.set(producer.id, { agentId, socketId: socket.id });
        if (agentId) {
          const s = agentProducers.get(agentId) || new Set();
          s.add(producer.id);
          agentProducers.set(agentId, s);
        }
        // notify operators watching this agent
        if (agentId) {
          io.of('/operator').to(agentId).emit('newProducer', { agentId, producerId: producer.id, kind });
        }
        cb(null, { id: producer.id });
      } catch (e) {
        cb(e.message);
      }
    });

    socket.on('consume', async ({ producerId, rtpCapabilities }, cb) => {
      try {
        if (!router.canConsume({ producerId, rtpCapabilities })) {
          cb('cannot_consume');
          return;
        }
        // create a consumer transport for this socket if not exists
        let transport = Object.values(socket._mediasoupTransport || {})[0];
        if (!transport) {
          // create recv transport
          const newTransport = await router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true
          });
          socket._mediasoupTransport = socket._mediasoupTransport || {};
          socket._mediasoupTransport[newTransport.id] = newTransport;
          transport = newTransport;
        }
        const consumer = await transport.consume({ producerId, rtpCapabilities, paused: false });
        // store consumer for resume handling
        consumers.set(consumer.id, consumer);
        cb(null, {
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          transportId: transport.id
        });
      } catch (e) {
        cb(e.message);
      }
    });

    socket.on('getProducers', (data, cb) => {
      const { agentId } = data || {};
      const s = agentProducers.get(agentId) || new Set();
      cb(null, Array.from(s));
    });

    socket.on('disconnect', () => {
      // cleanup transports and producers from this socket
      try {
        if (socket._mediasoupTransport) {
          Object.values(socket._mediasoupTransport).forEach(t => t.close());
        }
      } catch (e) {}
    });
    socket.on('resumeConsumer', ({ consumerId }, cb) => {
      const c = consumers.get(consumerId);
      if (c) {
        c.resume().then(() => {
          if (cb) cb(null);
        }).catch(err => {
          if (cb) cb(err && err.toString());
        });
      } else {
        if (cb) cb('consumer_not_found');
      }
    });
  });

  console.log('mediasoup initialized');
  return { worker, router };
}

module.exports = { initMediasoup, _worker: () => worker, _router: () => router };

