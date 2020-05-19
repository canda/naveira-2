import { subscribeToMethod, sendToPeer } from './peer.js';
import { createObservableValue } from './observable.js';

// { peerId: { value: observable, measurments: number[]} }
const offsets = {};

window.offsets = offsets;
let maxMeasurements = 100;

const newOffset = () => ({ measurments: [], value: createObservableValue() });

export const subscribeToPeerOffset = (peerId, callback) => {
  if (!offsets[peerId]) {
    offsets[peerId] = newOffset();
  }

  offsets[peerId].value.subscribeToValue(callback);
};

export const syncWithPeer = (peerId) => {
  maxMeasurements += 100;
  // ask everyone what time is it
  sendToPeer('whatTimeIsIt', { sentAt: Date.now() }, peerId);
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
    peerOffset = newOffset();
    offsets[peerId] = peerOffset;
  }
  peerOffset.measurments.push(calculatedOffset);
  const newMean = SimpleStatistics.mean(peerOffset.measurments);
  peerOffset.value.setValue(newMean);

  if (peerOffset.measurments.length > 100) {
    console.log('filtering');
    // const allowedDeviation = standardDeviation(peerOffset.measurments) * 4;
    const allowedDeviation = 42;
    peerOffset.filteredMeasurments = peerOffset.measurments.filter(
      (x) => newMean - allowedDeviation <= x && x <= newMean + allowedDeviation,
    );
    peerOffset.value.setValue(
      SimpleStatistics.mean(peerOffset.filteredMeasurments),
    );
  }
  if (peerOffset.measurments.length <= maxMeasurements) {
    setTimeout(
      () => sendToPeer('whatTimeIsIt', { sentAt: Date.now() }, peerId),
      100, // 🎩
    );
  }
});
