import { sendToAllPeers, subscribeToMethod } from './peer';
import { createObservableValue } from './observable';
import { download } from './webtorrent';

let _playlist = createObservableValue([]);

subscribeToMethod('changePlaylist', ({ payload }) => {
  _playlist.setValue(
    payload.playlist.map(({ magnetURI, name }) => ({
      magnetURI,
      name,
      file: download(magnetURI),
    })),
  );
});

const updatePlaylist = (newPlaylist) => {
  sendToAllPeers('changePlaylist', {
    playlist: newPlaylist.map((file) => ({
      magnetURI: file.magnetURI,
      name: file.name,
    })),
  });
  _playlist.setValue(newPlaylist);
};

export const addSong = (file) => {
  const newPlaylist = [
    ..._playlist.getValue(),
    { magnetURI: file.magnetURI, name: file.name, file: Promise.resolve(file) },
  ];
  updatePlaylist(newPlaylist);
};

export const removeSongAtIndex = (index) => {
  const newPlaylist = _playlist.getValue().filter((_song, i) => index !== i);
  updatePlaylist(newPlaylist);
};

export const onChange = (callback) => _playlist.subscribeToValue(callback);
