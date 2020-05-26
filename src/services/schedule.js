import { createObservableValue } from './observable';
import { playlistSchedule, playSchedule } from './music';
import { getValue as getPlaylist } from './playlist';
import { sendToAllPeers, subscribeToMethod, onPeerConnect } from './peer';

let _schedule = createObservableValue([]);
window._schedule = _schedule;

export const onChange = (callback) => _schedule.subscribeToValue(callback);

export const play = async () => {
  // console.log(
  //   'playlistSchedule(getPlaylist())',
  //   playlistSchedule(getPlaylist()),
  // );
  // console.log(
  //   'await playlistSchedule(getPlaylist())',
  //   await playlistSchedule(getPlaylist()),
  // );
  const schedule = await playlistSchedule(getPlaylist());
  console.log('_schedule.setValue(schedule);', schedule);
  _schedule.setValue(schedule);
  console.log('sendToAllPeers');
  sendToAllPeers('updateSchedule', {
    schedule,
  });

  console.log('schedule', schedule);
  // console.log('playSchedule(schedule)', playSchedule(schedule));

  await playSchedule(schedule);
};

subscribeToMethod('updateSchedule', ({ payload }) => {
  playSchedule(payload.schedule);
});

onPeerConnect((send) => {
  send('updateSchedule', {
    schedule: _schedule.getValue(),
  });
});
