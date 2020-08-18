import type { File } from './filestore';

const alreadyDownloaded = window.localStorage.getItem(
  'downloaded-default-songs',
);

const DEFAULT_SONGS = [
  {
    url: '/music/ambient-bongos.mp3',
    name: 'Ambient Bongos',
    magnetURI:
      'magnet:?xt=urn:btih:2a77533f382b6782107fc2304a07f6fe30dbf79b&dn=Unnamed+Torrent+1597716283651&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz',
  },
  // { url: '/music/bonfire.mp3', name: 'Bonfire' },
  // { url: '/music/marked.mp3', name: 'Marked' },
  // { url: '/music/sunny-rasta.mp3', name: 'Sunny Rasta' },
  // { url: '/music/the-story.mp3', name: 'The Story' },
];

const getDefultSongs = (forceDownload?: boolean): Promise<File[]> => {
  if (alreadyDownloaded || forceDownload) {
    return Promise.resolve([]);
  }
  return Promise.all(
    DEFAULT_SONGS.map(
      async ({ url, name, magnetURI }): Promise<File> => {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobHash = (window as any).md5(await blob.arrayBuffer());
        const file: File = {
          name,
          blob,
          blobHash,
          magnetURI,
        };
        return file;
      },
    ),
  );
};

export default getDefultSongs;
