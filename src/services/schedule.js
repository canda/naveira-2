import { createObservableValue } from './observable';
import { playlistSchedule, playSchedule } from './music';
import { getValue as getPlaylist } from './playlist';
import { sendToAllPeers, subscribeToMethod, onPeerConnect } from './peer';

let _schedule = createObservableValue();
window._debug = window._debug || {};
window._debug.schedule = _schedule;

export const onChange = (callback) => _schedule.subscribeToValue(callback);

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
