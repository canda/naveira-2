import Ably from 'ably'
import { roomId, ownId } from './ids';

const ably = new Ably.Realtime('FPRzWg.K37Q-g:DIzMBDeHognMNLuU');

const roomChannel = ably.channels.get(roomId);

const ownChannel = ably.channels.get(ownId);

const getChannel = (channelId: string) => ably.channels.get(channelId);

// List of external subscriptions to be called on data received by peers
// `method` key is used to filter received data
// [{ method: string, callback: (payload) => void }]
const subscriptions: {
  method: string;
  callback: (payload: any) => void;
}[] = [];

const linkSubscriptions = ({
  data: { payload, method },
}: {
  data: { payload: any; method: string };
}) => {
  subscriptions.forEach(({ method: subscriptionMethod, callback }) => {
    if (method === subscriptionMethod) {
      callback(payload);
    }
  });
};

roomChannel.subscribe('data', linkSubscriptions);
ownChannel.subscribe('data', linkSubscriptions);

export const subscribeToMethod = (
  method: string,
  callback: (payload: any) => void,
) => {
  subscriptions.push({ method, callback });
};

export const sendToAllPeers = (method: string, payload: any) => {
  roomChannel.publish('data', { method, payload });
};

export const sendToPeer = (method: string, payload: any, peerId: string) => {
  getChannel(peerId).publish('data', { method, payload });
};
