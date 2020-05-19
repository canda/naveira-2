import bufferToArrayBuffer from 'buffer-to-arraybuffer';

const URL = 'music.mp3';

const context = new AudioContext();

let musicPromise = fetch(URL)
  .then((response) => response.arrayBuffer())
  .then((arrayBuffer) => context.decodeAudioData(arrayBuffer));

let source;
let audioBuffer;
musicPromise.then((music) => {
  audioBuffer = music;
});

export const playAudioAtTime = (playTime) => {
  if (source) {
    source.stop();
  }

  source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);

  if (playTime - Date.now() > 0) {
    source.start(context.currentTime + (playTime - Date.now()) / 1000);
  } else {
    source.start(0, (Date.now() - playTime) / 1000);
  }
};

export const setMusicBuffer = (buffer) => {
  console.log('buffer', buffer);
  musicPromise = Promise.resolve(
    context.decodeAudioData(bufferToArrayBuffer(buffer)),
  );
};
