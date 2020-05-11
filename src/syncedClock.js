import { mean, standardDeviation } from 'simple-statistics';
import { sendToAllPeers, subscribeToMethod, sendToPeer } from './peer';
import { graph } from './graph';

// { peerId: { mean: number, measurments: number[]} }
const offsets = {};

window.offsets = offsets;

export const offsetWithPeer = (peerId) => (offsets[peerId] || {}).mean;

export const sync = () => {
  // ask everyone what time is it
  sendToAllPeers('whatTimeIsIt', { sentAt: Date.now() });
};

// when asked for time, answer with the same payload that comes but adding the current time
subscribeToMethod('whatTimeIsIt', ({ payload }, answer) => {
  answer('timeIs', { original: payload, time: Date.now() });
});

// when a peer answers what time is it,
// calculate statistically what the time offset with that peer is
subscribeToMethod('timeIs', ({ payload, peerId }) => {
  const messageTravelTime = payload.original.sentAt - Date.now();
  const calculatedOffset = payload.time - messageTravelTime / 2 - Date.now();

  let peerOffset = offsets[peerId];
  if (!peerOffset) {
    peerOffset = { measurments: [] };
    offsets[peerId] = peerOffset;
  }
  peerOffset.measurments.push(calculatedOffset);
  const newMean = mean(peerOffset.measurments);
  console.log(
    `changing offset of peer ${peerId} from ${
      peerOffset.mean
    } to ${newMean} (difference: ${newMean - peerOffset.mean})`,
  );
  peerOffset.mean = newMean;

  if (peerOffset.measurments.length > (window.maxMeasurements || 1000)) {
    const allowedDeviation = standardDeviation(peerOffset.measurments) * 4;
    const oldMean = peerOffset.mean;
    peerOffset.filteredMeasurments = peerOffset.measurments.filter(
      (x) => oldMean - allowedDeviation <= x && x <= oldMean + allowedDeviation,
    );
    console.log('allowedDeviation', allowedDeviation);
    console.log('oldMean', oldMean);
    console.log('newMean', mean(peerOffset.filteredMeasurments));
    if (window.filterOdd) {
      peerOffset.mean = mean(peerOffset.filteredMeasurments);
    }

    graph(peerOffset.measurments);
    return;
  }

  setTimeout(
    () => sendToPeer('whatTimeIsIt', { sentAt: Date.now() }, peerId),
    50, // 🎩
  );
});
