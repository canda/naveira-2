import { ownId } from './ids';
import { get } from './filestore';
import { getOffsetWithPeer } from './syncedClock';
import { download } from './webtorrent';
import type { Playlist } from './playlist';
import type { Schedule } from './schedule';

// const blobToArrayBuffer = (file) =>
//   new Promise((resolve) => {
//     let fileReader = new FileReader();

//     fileReader.onloadend = () => {
//       resolve(fileReader.result);
//     };

//     fileReader.readAsArrayBuffer(file);
//   });

const playAudioAtTime = async (playTime: number, blob: Blob) => {
  const context = new AudioContext();

  const arrayBuffer = await blob.arrayBuffer();

  const source = context.createBufferSource();
  source.buffer = await context.decodeAudioData(arrayBuffer);
  source.connect(context.destination);

  if (playTime - Date.now() > 0) {
    source.start(context.currentTime + (playTime - Date.now()) / 1000);
  } else {
    source.start(0, (Date.now() - playTime) / 1000);
  }
};

export const playSchedule = async (schedule: Schedule) => {
  let offset = 0;
  if (ownId !== schedule.owner) {
    offset = await getOffsetWithPeer(schedule.owner);
  }
  for (let i = 0; i < schedule.songs.length; i++) {
    const { time, magnetURI, blobHash } = schedule.songs[i];
    const { blob } = get(blobHash) || (await download(magnetURI));
    await playAudioAtTime(time, blob);
  }
};

const initialDelay = 5;
export const playlistSchedule = async (
  playlist: Playlist,
): Promise<Schedule> => {
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
    const lastTime: number = scheduleSongs[i - 1]
      ? scheduleSongs[i - 1].time
      : initialDelay + new Date().getTime();
    const lastDuration = durations[i - 1] || 0;
    scheduleSongs.push({
      blobHash: playlist[i].blobHash,
      magnetURI: playlist[i].magnetURI,
      time: lastTime + lastDuration + 1,
    });
  }

  return {
    songs: scheduleSongs,
    owner: ownId,
  };
};
