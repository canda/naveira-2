import { createObservableValue } from './observable';

const _client = new WebTorrent();
window._debug = window._debug || {};
window._debug.client = _client;

const _cache = {};

export const seed = (file) => {
  console.log('seeding', file);
  return new Promise((resolve) => {
    _client.seed(file, async (torrent) => {
      file.magnetURI = torrent.magnetURI;
      _cache[file.magnetURI] = Promise.resolve(file);
      resolve(file);
    });
  });
};

export const download = (magnetURI) => {
  console.log('downloading', magnetURI);
  if (_cache[magnetURI]) {
    return _cache[magnetURI];
  }

  _cache[magnetURI] = new Promise((resolve, reject) => {
    _client.add(magnetURI, (torrent) => {
      const file = torrent.files[0];
      console.log('file', file);
      file.getBlob((error, blob) => {
        console.log('error, blob', error, blob);
        if (error) {
          return reject(error);
        }
        resolve({
          name: file.name,
          magnetURI,
          blob,
        });
      });
    });
  });

  return _cache[magnetURI];
};

export const speeds = createObservableValue({
  uploadSpeed: 0,
  downloadSpeed: 0,
});

export const torrentProgresses = createObservableValue([]);
window._debug.torrentProgresses = torrentProgresses;

setInterval(() => {
  speeds.setValue({
    uploadSpeed: _client.uploadSpeed,
    downloadSpeed: _client.downloadSpeed,
  });
  torrentProgresses.setValue(
    _client.torrents.map((t) => ({
      progress: t.progress,
      magnetURI: t.magnetURI,
    })),
  );
}, 500);
