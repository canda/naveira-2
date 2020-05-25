const client = new WebTorrent();

const cache = {};

export const seed = (file) =>
  new Promise((resolve) => {
    client.seed(file, async (torrent) => {
      file.magnetURI = torrent.magnetURI;
      cache[file.magnetURI] = Promise.resolve(file);
      resolve(file);
    });
  });

export const download = (magnetURI) => {
  if (cache[magnetURI]) {
    return cache[magnetURI];
  }

  cache[magnetURI] = new Promise((resolve) => {
    client.add(magnetURI, (torrent) => {
      resolve(torrent.files[0]);
    });
  });

  return cache[magnetURI];
};
