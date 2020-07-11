import { openDB } from 'idb';
import md5 from 'md5';
import { createObservableValue } from './observable';
import { download, seed } from './webtorrent';

const dbPromise = openDB('file-store', 1, {
  upgrade(db) {
    db.createObjectStore('filesByBlobHash');
  },
});

const _files = createObservableValue([]);
window._debug = window._debug || {};
window._debug.files = _files;

export const onChange = (callback) => _files.subscribeToValue(callback);

const getSavedFiles = async () => {
  return Promise.all(
    (await (await dbPromise).getAllKeys('filesByBlobHash')).map(async (key) =>
      (await dbPromise).get('filesByBlobHash', key),
    ),
  );
};

getSavedFiles().then((savedFiles) => {
  _files.setValue([..._files.getValue(), ...savedFiles]);
});

export const get = async (blobHash) =>
  _files.getValue().find((f) => f.blobHash === blobHash);

export const add = async ({ name, blob }) => {
  const blobHash = md5(blob);
  const file = { blob, name, blobHash };
  (await dbPromise).put('filesByBlobHash', file, blobHash);
  _files.setValue([..._files.getValue(), file]);
  return file;
};

export const remove = async (blobHash) => {
  _files.setValue(_files.getValue().filter((f) => f.blobHash !== blobHash));
  (await dbPromise).delete('filesByBlobHash', blobHash);
};

// export const clear = async () => {
//   return (await dbPromise).clear('filesByBlobHash');
// };
