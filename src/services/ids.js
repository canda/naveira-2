import { v4 as uuid } from 'uuid';

export const ownId = uuid();

const queryParams = new URLSearchParams(window.location.search);
export const roomId = queryParams.get('room') || uuid();

if (!queryParams.get('room')) {
  queryParams.set('room', roomId);
  var newPath = `${window.location.pathname}?${queryParams.toString()}`;
  history.pushState(null, '', newPath);
}
