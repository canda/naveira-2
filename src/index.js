import { subscribeToPeerOffset, syncWithPeer } from './syncedClock.js';
import { sendToAllPeers, subscribeToMethod } from './peer.js';
import { playAudioAtTime } from './music.js';

let playingPeer;

const play = () => {
  const timeToPlay = Date.now();
  sendToAllPeers('play', { time: timeToPlay });
  playAudioAtTime(timeToPlay);
};

subscribeToMethod('play', ({ payload, peerId }) => {
  playingPeer = peerId;
  console.log(
    `playing in ${Math.round((payload.time - Date.now()) / 1000)} seconds`,
  );
  syncWithPeer(peerId);
  subscribeToPeerOffset(peerId, (offset = 0) => {
    const playTime = payload.time - offset;
    playAudioAtTime(playTime);
  });
});

window.play = play;
window.sync = () => syncWithPeer(playingPeer);
