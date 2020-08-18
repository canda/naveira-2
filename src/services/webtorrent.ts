// import WebTorrent from 'webtorrent';
import { createObservableValue } from './observable';

declare const WebTorrent: any;

const _client = new WebTorrent();
(window as any)._debug = (window as any)._debug || {};
(window as any)._debug.client = _client;

const _cache: Record<string, Promise<{ magnetURI: string; blob: Blob }>> = {};

// TODO: fix, there is no public api currently to resume a seed on a web client
// https://github.com/webtorrent/webtorrent/issues/320#issuecomment-385317621
// export const resumeSeeding = (blob: Blob, magnetURI: string) => {
//   _client.add(magnetURI, (torrent: any) => {
//     console.log('added magnet', magnetURI, torrent);
//     torrent.load(blob.stream(), (err) => {
//       err
//         ? console.error('error while resuming seed', blob, magnetURI, err)
//         : console.log('continue seeding', magnetURI, blob);
//     });
//   });
// };

export const seed = (blob: Blob) => {
  return new Promise((resolve) => {
    _client.seed(blob, async ({ magnetURI }: { magnetURI: string }) => {
      console.log('seeding', magnetURI, blob);
      _cache[magnetURI] = Promise.resolve({ blob, magnetURI });
      resolve(blob);
    });
  });
};

export const download = (magnetURI: string) => {
  console.log('downloading', magnetURI);
  if (_cache[magnetURI]) {
    return _cache[magnetURI];
  }

  _cache[magnetURI] = new Promise((resolve, reject) => {
    _client.add(magnetURI, (torrent: any) => {
      const file = torrent.files[0];
      console.log('file', file);
      file.getBlob((error: any, blob: Blob) => {
        console.log('error, blob', error, blob);
        if (error) {
          return reject(error);
        }
        // TODO: save file in file store
        resolve({
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
(window as any)._debug.torrentProgresses = torrentProgresses;

setInterval(
  () => console.log('_client.downloadSpeed', _client.downloadSpeed),
  1000,
);

setInterval(() => {
  speeds.setValue({
    uploadSpeed: _client.uploadSpeed,
    downloadSpeed: _client.downloadSpeed,
  });
  torrentProgresses.setValue(
    _client.torrents.map(
      ({ progress, magnetURI }: { progress: number; magnetURI: string }) => ({
        progress: progress,
        magnetURI: magnetURI,
      }),
    ),
  );
}, 500);
