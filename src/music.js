import bufferToArrayBuffer from 'buffer-to-arraybuffer';

const URL = 'music.mp3';

const context = new AudioContext();

let musicPromise = fetch(URL)
  .then((response) => response.arrayBuffer())
  .then((arrayBuffer) => context.decodeAudioData(arrayBuffer));

let source;
export const playAudioAtTime = (playTime) => {
  if (source) {
    try {
      source.stop();
    } catch (e) {
      console.error(e);
    }
  }

  musicPromise.then((audioBuffer) => {
    source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    source.start(context.currentTime + (playTime - Date.now()) / 1000);
  });
};

export const setMusicBuffer = (buffer) => {
  console.log('buffer', buffer);
  musicPromise = Promise.resolve(
    context.decodeAudioData(bufferToArrayBuffer(buffer)),
  );
};
