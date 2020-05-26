const _client = new WebTorrent();
window._client = _client;

const _cache = {};

export const seed = (file) => {
  console.log('seeding', file);
  return new Promise((resolve) => {
    _client.seed(file, async (torrent) => {
      file.magnetURI = torrent.magnetURI;
      _cache[file.magnetURI] = Promise.resolve(file);
      resolve(file);
    });
  });
};

export const download = (magnetURI) => {
  console.log('downloading', magnetURI);
  if (_cache[magnetURI]) {
    return _cache[magnetURI];
  }

  _cache[magnetURI] = new Promise((resolve, reject) => {
    _client.add(magnetURI, (torrent) => {
      const file = torrent.files[0];
      console.log('file', file);
      file.getBlob((error, blob) => {
        console.log('error, blob', error, blob);
        if (error) {
          return reject(error);
        }
        blob.magnetURI = magnetURI;
        resolve(blob);
      });
    });
  });

  return _cache[magnetURI];
};
