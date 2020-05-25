import { openDB } from 'idb';

const dbPromise = openDB('file-store', 1, {
  upgrade(db) {
    db.createObjectStore('filesByMagnet');
  },
});

export const get = async (key) => {
  return (await dbPromise).get('filesByMagnet', key);
};
export const save = async (key, val) => {
  return (await dbPromise).put('filesByMagnet', val, key);
};
export const remove = async (key) => {
  return (await dbPromise).delete('filesByMagnet', key);
};
// export const clear = async () => {
//   return (await dbPromise).clear('filesByMagnet');
// };
export const getAll = async () => {
  return Promise.all(
    (await (await dbPromise).getAllKeys('filesByMagnet')).map(async (key) => {
      const file = await get(key);
      file.magnetURI = key;
      return file;
    }),
  );
};
