const URL = 'music.mp3';

const context = new AudioContext();
const context2 = new AudioContext();

let musicPromise = fetch(URL)
  .then((response) => response.arrayBuffer())
  .then((arrayBuffer) => context.decodeAudioData(arrayBuffer));

let source;
export const playAudioAtTime = (context, playTime, syncedClock) => {
  if (source) {
    try {
      source.stop();
    } catch (e) {
      console.error('error while stopping previous audio', e);
    }
  }

  musicPromise.then((audioBuffer) => {
    source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    if (playTime < syncedClock.now()) {
      source.start(0, (syncedClock.now() - playTime) / 1000);
    } else {
      source.start(context.currentTime + (playTime - syncedClock.now()) / 1000);
    }
  });
};
