import { createObservableValue } from './observable';

let _playlist = createObservableValue([]);

export const addSong = (file) => {
  _playlist.setValue([..._playlist.getValue(), file]);
};

export const onChange = (callback) => _playlist.subscribeToValue(callback);
