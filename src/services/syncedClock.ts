import SimpleStatistics from 'simple-statistics';
import { subscribeToMethod, sendToPeer } from './peer';
import { createObservableValue, Observable } from './observable';

type Offset = {
  measurements: number[];
  value: Observable<number>;
  averagedValue: Observable<number>;
  filteredMeasurements?: number[];
};
// { peerId: { value: observable, measurements: number[]} }
const offsets: Record<string, Offset> = {};
(window as any)._debug = (window as any)._debug || {};
(window as any)._debug.offsets = offsets;
let maxMeasurements = 100;

const newOffset = (): Offset => ({
  measurements: [],
  value: createObservableValue(),
  averagedValue: createObservableValue(),
});

export const getOffsetWithPeer = (peerId: string): Promise<number> =>
  new Promise((resolve) => {
    syncWithPeer(peerId);
    subscribeToPeerOffset(peerId, (value) => {
      if (value) {
        resolve(value);
      }
    });
  });

const subscribeToPeerOffset = (
  peerId: string,
  callback: (value: number) => void,
) => {
  if (!offsets[peerId]) {
    offsets[peerId] = newOffset();
  }

  offsets[peerId].averagedValue.subscribeToValue(callback);
};

interface WhatTimeIsItPayload {
  sentAt: number;
}

const syncWithPeer = (peerId: string) => {
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
  peerOffset.measurements.push(calculatedOffset);
  const newMean = SimpleStatistics.mean(peerOffset.measurements);
  peerOffset.value.setValue(newMean);

  if (peerOffset.measurements.length > maxMeasurements) {
    console.log('filtering');
    // const allowedDeviation = standardDeviation(peerOffset.measurements) * 4;
    const allowedDeviation = 42;
    peerOffset.filteredMeasurements = peerOffset.measurements.filter(
      (x) => newMean - allowedDeviation <= x && x <= newMean + allowedDeviation,
    );
    peerOffset.value.setValue(
      SimpleStatistics.mean(peerOffset.filteredMeasurements),
    );
    peerOffset.averagedValue.setValue(
      SimpleStatistics.mean(peerOffset.filteredMeasurements),
    );
  }
  if (peerOffset.measurements.length <= maxMeasurements) {
    setTimeout(
      () => sendToPeer('whatTimeIsIt', { sentAt: Date.now() }, peerId),
      20, // 🎩
    );
  }
});
