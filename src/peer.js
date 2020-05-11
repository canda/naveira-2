import Peer from 'simple-peer';

import { ownId, roomId } from './ids';
import * as SocketChannel from './socket';

// List of all the connected peers
// [{ id: string, connection: {new Peer()} }]
const peers = [];

window.peers = peers;

// List of external subscriptions to be called on data received by peers
// `method` key is used to filter received data
// [{ method: string, callback: (data) => void }]
const subscriptions = [];

// List of messages used to be send to newcomers
// [{ method: string, data: any }]
const persistedMessages = [];

export const subscribeToMethod = (method, callback) => {
  subscriptions.push({ method, callback });
};

export const getPeerIds = () => peers.map(({ id }) => id);

export const sendToAllPeers = (method, data, persist) => {
  peers.forEach((peer) => {
    if (
      !peer.connection ||
      !peer.connection.writable ||
      !peer.connection.connected
    ) {
      // removePeer(peer.id);
      console.log('Peer connection unreachable', peer.id, peer.connection);
      return;
    }
    peer.connection.send(
      JSON.stringify({
        method,
        data,
      }),
    );
  });

  if (persist) {
    persistedMessages.push({
      method,
      data,
    });
  }
};

export const sendToPeer = (method, data, peerId) => {
  const peer = peers.find((p) => p.id === peerId);

  if (!peer) {
    // eslint-disable-next-line no-console
    console.error('could not found peer', peerId);
    return;
  }

  if (
    !peer.connection ||
    !peer.connection.writable ||
    !peer.connection.connected
  ) {
    // removePeer(peer.id);
    console.error('Peer connection unreachable', peer.id, peer.connection);
    return;
  }

  peer.connection.send(
    JSON.stringify({
      method,
      data,
    }),
  );
};

const removePeer = (peerId) => {
  const index = peers.findIndex((p) => p.id === peerId);
  if (index >= 0) {
    peers[index].connection.destroy();
    peers.splice(index, 1);
  }
};

const setupSubscriptionCallbacks = (peer) => {
  peer.connection.on('data', (stringData) => {
    const { method, data } = JSON.parse(stringData);
    console.log('data', { method, data });
    subscriptions
      .filter((subscription) => subscription.method === method)
      .forEach((subscription) => {
        subscription.callback(
          { payload: data, peerId: peer.id },
          (answerMethod, answerPayload) =>
            peer.connection.send(
              JSON.stringify({
                method: answerMethod,
                data: answerPayload,
              }),
            ),
        );
      });
  });

  peer.connection.on('connect', () => {
    console.log('connect', peer);
    persistedMessages.forEach(({ method, data }) => {
      sendToPeer(method, data, peer.id);
    });
  });

  peer.connection.on('close', () => {
    console.log('close', peer);
    removePeer(peer.id);
  });

  peer.connection.on('error', (error) => {
    console.log('error', error, peer);
    removePeer(peer.id);
  });
};

// Hackish or what?
setTimeout(() => {
  // Let everyone know I want to join the channel
  SocketChannel.sendToAllPeers('peer-joined', { id: ownId, roomId });
}, 1000);

// When someone wants to join the channel
// we create a peer connection and send him the signalling data back
SocketChannel.subscribeToMethod('peer-joined', ({ id }) => {
  console.log('peer-joined', id);
  if (id === ownId) {
    return;
  }

  // TODO: make peer connection UDP
  // Create the peer connection instance
  const connection = new Peer({
    initiator: true,
    trickle: false,
  });

  const peer = {
    id,
    connection,
  };

  // Save the peer connection for later use
  peers.push(peer);

  setupSubscriptionCallbacks(peer);

  // Create signaling data from the webrtc library
  connection.on('signal', (data) => {
    console.log('initiator signal', data);
    // Send the webrtc signalling data through websockets to try to establish connection
    SocketChannel.sendToPeer(
      'signal',
      {
        id: ownId,
        signalData: data,
      },
      id,
    );
  });
});

// When receiving a signal, we create the other instance of the peer connection
// And send back an answer signal to finish establishing webrtc connection
SocketChannel.subscribeToMethod('signal', ({ id, signalData }) => {
  console.log('receiving signal', { id, signalData });
  let peer = peers.find((p) => p.id === id);

  if (!peer) {
    const connection = new Peer({
      initiator: false,
      trickle: false,
    });

    peer = {
      id,
      connection,
    };
    peers.push(peer);
    setupSubscriptionCallbacks(peer);

    // Create the answering signal data from the webrtc library
    connection.on('signal', (data) => {
      console.log('receiver signal', data);
      SocketChannel.sendToPeer(
        'signal',
        {
          id: ownId,
          signalData: data,
        },
        id,
      );
    });
  }

  peer.connection.signal(signalData);
});
