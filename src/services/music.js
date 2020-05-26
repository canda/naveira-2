import { get } from './filestore';

const blobToArrayBuffer = (file) =>
  new Promise((resolve) => {
    let fileReader = new FileReader();

    fileReader.onloadend = () => {
      resolve(fileReader.result);
    };

    fileReader.readAsArrayBuffer(file);
  });

// const musicPromise = fetch('./music.mp3')
//   .then((response) => response.arrayBuffer())
//   .then((arrayBuffer) => context.decodeAudioData(arrayBuffer));

let source;
// let audioBuffer;
// musicPromise.then((music) => {
//   audioBuffer = music;
// });

const playAudioAtTime = async (playTime, file) => {
  console.log('playAudioAtTime');
  const context = new AudioContext();

  const arrayBuffer = await blobToArrayBuffer(file);

  source = context.createBufferSource();
  source.buffer = await context.decodeAudioData(arrayBuffer);
  source.connect(context.destination);

  console.log('source.buffer', source.buffer);

  if (playTime - Date.now() > 0) {
    console.log('1 playTime - Date.now()', playTime - Date.now());
    source.start(context.currentTime + (playTime - Date.now()) / 1000);
  } else {
    console.log('2 playTime - Date.now()', playTime - Date.now());
    source.start(0, (Date.now() - playTime) / 1000);
  }
};

export const playSchedule = async (schedule) => {
  console.log('playSchedule', schedule);
  for (let i = 0; i < schedule.length; i++) {
    const { time, magnetURI } = schedule[i];
    console.log('{ time, magnetURI }', { time, magnetURI });
    const file = await get(magnetURI);
    console.log('file', file);
    await playAudioAtTime(time, file);
  }
};

const initialDelay = 5;
export const playlistSchedule = async (playlist) => {
  const context = new AudioContext();
  console.log('1');
  const fileArrayBuffers = await Promise.all(
    playlist.map(async (song) => blobToArrayBuffer(await song.file)),
  );

  console.log('2');
  const durations = await Promise.all(
    fileArrayBuffers.map(
      async (x) => (await context.decodeAudioData(x)).duration * 1000,
    ),
  );
  console.log('3');

  let schedule = [];
  for (let i = 0; i < playlist.length; i++) {
    console.log('4');
    const lastTime = schedule[i - 1]
      ? schedule[i - 1].time
      : initialDelay + new Date().getTime();
    const lastDuration = durations[i - 1] || 0;
    schedule.push({
      time: lastTime + lastDuration + 1,
      magnetURI: playlist[i].magnetURI,
    });
  }

  console.log('schedule', schedule);
  return schedule;
};
