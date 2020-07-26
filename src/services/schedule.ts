import { createObservableValue } from './observable';
import { playlistSchedule, playSchedule } from './music';
import { getValue as getPlaylist } from './playlist';
import { sendToAllPeers, subscribeToMethod, onPeerConnect } from './peer';

export type Schedule = {
  songs: { blobHash: string; magnetURI: string; time: number }[];
  owner: string;
};

let _schedule = createObservableValue();
(window as any)._debug = (window as any)._debug || {};
(window as any)._debug.schedule = _schedule;

export const onChange = (callback: (newSchedule: Schedule) => void) =>
  _schedule.subscribeToValue(callback);

export const play = async () => {
  if (_schedule.value) {
    return;
  }
  const schedule = await playlistSchedule(getPlaylist());
  _schedule.setValue(schedule);

  sendToAllPeers('updateSchedule', {
    schedule,
  });

  await playSchedule(schedule);
};

subscribeToMethod('updateSchedule', ({ payload }) => {
  _schedule.setValue(payload.schedule);
  playSchedule(payload.schedule);
});

onPeerConnect((send) => {
  send('updateSchedule', {
    schedule: _schedule.getValue(),
  });
});
