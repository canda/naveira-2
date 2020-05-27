import { ownId } from './ids';
import { get } from './filestore';
import { getOffsetWithPeer } from './syncedClock';

// const blobToArrayBuffer = (file) =>
//   new Promise((resolve) => {
//     let fileReader = new FileReader();

//     fileReader.onloadend = () => {
//       resolve(fileReader.result);
//     };

//     fileReader.readAsArrayBuffer(file);
//   });

const playAudioAtTime = async (playTime, file) => {
  const context = new AudioContext();

  const arrayBuffer = await file.arrayBuffer();

  const source = context.createBufferSource();
  source.buffer = await context.decodeAudioData(arrayBuffer);
  source.connect(context.destination);

  if (playTime - Date.now() > 0) {
    source.start(context.currentTime + (playTime - Date.now()) / 1000);
  } else {
    source.start(0, (Date.now() - playTime) / 1000);
  }
};

export const playSchedule = async (schedule) => {
  let offset = 0;
  if (ownId !== schedule.owner) {
    offset = await getOffsetWithPeer(schedule.owner);
  }
  for (let i = 0; i < schedule.songs.length; i++) {
    const { time, magnetURI } = schedule.songs[i];
    const { blob } = await get(magnetURI);
    await playAudioAtTime(time, blob);
  }
};

const initialDelay = 5;
export const playlistSchedule = async (playlist) => {
  const context = new AudioContext();
  const fileArrayBuffers = await Promise.all(
    playlist.map(async (song) =>
      (await get(song.magnetURI)).blob.arrayBuffer(),
    ),
  );

  const durations = await Promise.all(
    fileArrayBuffers.map(
      async (x) => (await context.decodeAudioData(x)).duration * 1000,
    ),
  );

  let scheduleSongs = [];
  for (let i = 0; i < playlist.length; i++) {
    const lastTime = scheduleSongs[i - 1]
      ? scheduleSongs[i - 1].time
      : initialDelay + new Date().getTime();
    const lastDuration = durations[i - 1] || 0;
    scheduleSongs.push({
      time: lastTime + lastDuration + 1,
      magnetURI: playlist[i].magnetURI,
    });
  }

  return {
    songs: scheduleSongs,
    owner: ownId,
  };
};
