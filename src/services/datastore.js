import { openDB } from 'https://unpkg.com/idb@5.0.3/build/esm/index.js';

export const random = Math.random();
console.log('random', random);

const dbPromise = openDB('keyval-store', 1, {
  upgrade(db) {
    db.createObjectStore('keyval');
  },
});

export const get = async (key) => {
  return (await dbPromise).get('keyval', key);
};
export const set = async (key, val) => {
  return (await dbPromise).put('keyval', val, key);
};
export const remove = async (key) => {
  return (await dbPromise).delete('keyval', key);
};
export const clear = async () => {
  return (await dbPromise).clear('keyval');
};
export const keys = async () => {
  return (await dbPromise).getAllKeys('keyval');
};
