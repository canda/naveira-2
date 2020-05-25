const client = new WebTorrent();

export const seed = (file) =>
  new Promise((resolve) => {
    client.seed(file, async (torrent) => {
      file.magnetURI = torrent.magnetURI;
      resolve(file);
    });
  });
