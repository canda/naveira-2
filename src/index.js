import {
  html,
  render,
} from 'https://unpkg.com/htm/preact/standalone.module.js';
import { subscribeToPeerOffset, syncWithPeer } from './services/syncedClock.js';
import { sendToAllPeers, subscribeToMethod } from './services/peer.js';
import { playAudioAtTime } from './services/music.js';
import { set, get } from './services/datastore.js';
import App from './ui/App.js';

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

render(html`<${App} page="All" />`, document.body);
