const context = new AudioContext();

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
let audioBuffer;
// musicPromise.then((music) => {
//   audioBuffer = music;
// });

const playAudioAtTime = async (playTime, file) => {
  if (source) {
    source.stop();
  }

  const arrayBuffer = await blobToArrayBuffer(file);
  await context.decodeAudioData(arrayBuffer);

  source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);

  if (playTime - Date.now() > 0) {
    source.start(context.currentTime + (playTime - Date.now()) / 1000);
  } else {
    source.start(0, (Date.now() - playTime) / 1000);
  }
};

export const playSchedule = (schedule) => {};

const initialDelay = 5;
export const playlistSchedule = async (playlist) => {
  const fileArrayBuffers = await Promise.all(
    playlist.map(async (song) => blobToArrayBuffer(await song.file)),
  );

  const durations = await Promise.all(
    fileArrayBuffers.map(
      async (x) => (await context.decodeAudioData(x)).duration,
    ),
  );

  let schedule = [];
  for (let i = 0; i < playlist.length; i++) {
    const lastTime = schedule[i - 1]
      ? schedule[i - 1].time
      : initialDelay + new Date().getTime() / 1000;
    const lastDuration = durations[i - 1] || 0;
    schedule.push({
      time: lastTime + lastDuration + 1,
      magnetURI: playlist[i].magnetURI,
    });
  }

  console.log('schedule', schedule);
  return schedule;
};
