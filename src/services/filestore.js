import { openDB } from 'idb';
import { createObservableValue } from './observable';
import { download, seed } from './webtorrent';

const dbPromise = openDB('file-store', 1, {
  upgrade(db) {
    db.createObjectStore('filesByMagnet');
  },
});

const _files = createObservableValue([]);
window._debug = window._debug || {};
window._debug.files = _files;

export const onChange = (callback) => _files.subscribeToValue(callback);

const getSavedFiles = async () => {
  return Promise.all(
    (await (await dbPromise).getAllKeys('filesByMagnet')).map(async (key) => {
      const file = await (await dbPromise).get('filesByMagnet', key);
      file.magnetURI = key;
      return file;
    }),
  );
};

getSavedFiles().then((savedFiles) => {
  _files.setValue([..._files.getValue(), ...savedFiles]);
});

export const get = async (magnetURI) => {
  const localFile = _files.getValue().find((f) => f.magnetURI === magnetURI);
  if (localFile) {
    return Promise.resolve(localFile);
  }
  const downloadedFile = await download(magnetURI);
  _files.setValue([..._files.getValue(), downloadedFile]);
  return downloadedFile;
};

export const add = async ({ name, blob, magnetURI }) => {
  if (!magnetURI) {
    magnetURI = (await seed(blob)).magnetURI;
  }
  const file = { blob, name, magnetURI };
  (await dbPromise).put('filesByMagnet', file, magnetURI);
  _files.setValue([..._files.getValue(), file]);
  return file;
};

export const remove = async (magnetURI) => {
  _files.setValue(_files.getValue().filter((f) => f.magnetURI !== magnetURI));
  (await dbPromise).delete('filesByMagnet', magnetURI);
};

// export const clear = async () => {
//   return (await dbPromise).clear('filesByMagnet');
// };
