import { offsetWithPeer, sync } from './syncedClock';
import { sendToAllPeers, subscribeToMethod } from './peer';
import { playAudioAtTime } from './music';

const play = () => {
  const timeToPlay = Date.now() + 10000;
  sendToAllPeers('play', { time: timeToPlay });
  playAudioAtTime(timeToPlay);
};

subscribeToMethod('play', ({ payload, peerId }) => {
  const playTime = payload.time - offsetWithPeer(peerId);
  playAudioAtTime(playTime);
  console.log('peerId', peerId);
  console.log('offsets', window.offsets);
  console.log(`playing in ${Date.now() - playTime} at ${playTime}`);
  console.log('Date.now()', Date.now());
  console.log('offsetWithPeer(peerId)', offsetWithPeer(peerId));
});

window.play = play;
window.sync = sync;
