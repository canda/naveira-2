import { sendToAllPeers, subscribeToMethod, onPeerConnect } from './peer';
import { createObservableValue, Observable } from './observable';
import { download } from './webtorrent';

export type Playlist = { magnetURI: string; blobHash: string }[];

let _playlist: Observable<Playlist> = createObservableValue([]);
window._debug = window._debug || {};
window._debug.playlist = _playlist;

subscribeToMethod(
  'changePlaylist',
  ({ payload }: { payload: { playlist: Playlist } }) => {
    _playlist.setValue(payload.playlist);

    payload.playlist.forEach(async ({ magnetURI }) => {
      await download(magnetURI);
    });
  },
);

onPeerConnect((send) => {
  send('changePlaylist', {
    playlist: _playlist.getValue(),
  });
});

const updatePlaylist = (playlist: Playlist) => {
  sendToAllPeers('changePlaylist', {
    playlist,
  });
  _playlist.setValue(playlist);
};

export const addSong = ({
  magnetURI,
  blobHash,
}: {
  magnetURI: string;
  blobHash: string;
}) => {
  const newPlaylist = [..._playlist.getValue(), { magnetURI, blobHash }];
  updatePlaylist(newPlaylist);
};

export const removeSongAtIndex = (index: number) => {
  const newPlaylist = _playlist.getValue().filter((_song, i) => index !== i);
  updatePlaylist(newPlaylist);
};

export const onChange = (callback: (newPlaylist: Playlist) => void) =>
  _playlist.subscribeToValue(callback);

export const getValue = () => _playlist.getValue();
