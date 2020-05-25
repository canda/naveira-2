import { openDB } from 'idb';

const dbPromise = openDB('file-store', 1, {
  upgrade(db) {
    db.createObjectStore('keyval');
  },
});

export const get = async (key) => {
  return (await dbPromise).get('keyval', key);
};
export const save = async (key, val) => {
  return (await dbPromise).put('keyval', val, key);
};
export const remove = async (key) => {
  return (await dbPromise).delete('keyval', key);
};
// export const clear = async () => {
//   return (await dbPromise).clear('keyval');
// };
export const getAll = async () => {
  return Promise.all(
    (await (await dbPromise).getAllKeys('keyval')).map(async (key) => {
      const file = await get(key);
      file.magnetURI = key;
      return file;
    }),
  );
};
