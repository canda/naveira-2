import { openDB } from 'idb';
import { createObservableValue } from './observable';
import { download, seed } from './webtorrent';

const dbPromise = openDB('file-store', 1, {
  upgrade(db) {
    db.createObjectStore('filesByMagnet');
  },
});

const _files = createObservableValue([]);

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

console.log('getSavedFiles before');
getSavedFiles().then((savedFiles) => {
  console.log('getSavedFiles');
  _files.setValue([..._files.getValue(), ...savedFiles]);
});

export const get = async (magnetURI) => {
  if (_files.getValue()[magnetURI]) {
    return Promise.resolve(
      _files.getValue().find((f) => f.magnetURI === magnetURI),
    );
  }
  return download(magnetURI);
};

export const add = async (blob) => {
  const file = await seed(blob);
  (await dbPromise).put('filesByMagnet', file, file.magnetURI);
  return file;
};

export const remove = async (magnetURI) => {
  const newFiles = { ..._files.getValue() };
  delete newFiles[magnetURI];
  _files.setValue(newFiles);
  (await dbPromise).delete('filesByMagnet', magnetURI);
};

// export const clear = async () => {
//   return (await dbPromise).clear('filesByMagnet');
// };
