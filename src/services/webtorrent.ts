// import WebTorrent from 'webtorrent';
import { createObservableValue } from './observable';

declare const WebTorrent: any;

const _client = new WebTorrent();
(window as any)._debug = (window as any)._debug || {};
(window as any)._debug.client = _client;

const _cache: Record<string, Promise<{ magnetURI: string; blob: Blob }>> = {};

export const seed = (blob: Blob) => {
  console.log('seeding', blob);
  return new Promise((resolve) => {
    _client.seed(blob, async ({ magnetURI }: { magnetURI: string }) => {
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
