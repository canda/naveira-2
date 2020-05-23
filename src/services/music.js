const context = new AudioContext();

const musicPromise = fetch('./music.mp3')
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
