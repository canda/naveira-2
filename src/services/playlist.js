import { sendToAllPeers, subscribeToMethod, onPeerConnect } from './peer';
import { createObservableValue } from './observable';
import { get } from './filestore';

let _playlist = createObservableValue([]);
window._playlist = _playlist;

subscribeToMethod('changePlaylist', ({ payload }) => {
  _playlist.setValue(
    payload.playlist.map(({ magnetURI, name }) => ({
      magnetURI,
      name,
      file: get(magnetURI),
    })),
  );
});

onPeerConnect((send) => {
  send('changePlaylist', {
    playlist: _playlist.getValue(),
  });
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

export const getValue = () => _playlist.getValue();
