import Ably from 'ably/browser/static/ably.noencryption';
import { roomId, ownId } from './ids';

const ably = new Ably.Realtime('FPRzWg.K37Q-g:DIzMBDeHognMNLuU');

const roomChannel = ably.channels.get(roomId);

const ownChannel = ably.channels.get(ownId);

const getChannel = (channelId) => ably.channels.get(channelId);

// List of external subscriptions to be called on data received by peers
// `method` key is used to filter received data
// [{ method: string, callback: (payload) => void }]
const subscriptions = [];

const linkSubscriptions = ({ data: { payload, method } }) => {
  subscriptions.forEach(({ method: subscriptionMethod, callback }) => {
    if (method === subscriptionMethod) {
      callback(payload);
    }
  });
};

roomChannel.subscribe('data', linkSubscriptions);
ownChannel.subscribe('data', linkSubscriptions);

export const subscribeToMethod = (method, callback) => {
  subscriptions.push({ method, callback });
};

export const sendToAllPeers = (method, payload) => {
  roomChannel.publish('data', { method, payload });
};

export const sendToPeer = (method, payload, peerId) => {
  getChannel(peerId).publish('data', { method, payload });
};
