import { openDB } from 'idb';
// import md5 from 'js-md5';
import { createObservableValue } from './observable';

const dbPromise = openDB('file-store', 1, {
  upgrade(db) {
    db.createObjectStore('filesByBlobHash');
  },
});

export type File = { blob: Blob; name: string; blobHash: string };

const _files = createObservableValue([] as File[]);
(window as any)._debug = (window as any)._debug || {};
(window as any)._debug.files = _files;

export const onChange = (callback: (files: File[]) => void) =>
  _files.subscribeToValue(callback);

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

export const get = (blobHash: string) =>
  _files.getValue().find((f) => f.blobHash === blobHash);

export const add = async ({ name, blob }: { name: string; blob: Blob }) => {
  const blobHash = (await blob.arrayBuffer()).byteLength.toString();
  const file = { blob, name, blobHash };
  (await dbPromise).put('filesByBlobHash', file, blobHash);
  _files.setValue([..._files.getValue(), file]);
  return file;
};

export const remove = async (blobHash: string) => {
  _files.setValue(_files.getValue().filter((f) => f.blobHash !== blobHash));
  (await dbPromise).delete('filesByBlobHash', blobHash);
};

// export const clear = async () => {
//   return (await dbPromise).clear('filesByBlobHash');
// };
