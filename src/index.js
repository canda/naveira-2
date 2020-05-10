import { getPeerIds, sendToAllPeers, subscribeToMethod } from './peer';

setTimeout(() => console.log('getPeerIds', getPeerIds()), 10000);

window.sendToAllPeers = sendToAllPeers;
window.subscribeToMethod = subscribeToMethod;
