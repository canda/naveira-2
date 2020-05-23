import {
  html,
  useEffect,
  useState,
} from 'https://unpkg.com/htm/preact/standalone.module.js';
import { keys, get, set } from '../services/datastore.js';

const client = new WebTorrent();

const App = () => {
  const [files, setFiles] = useState([]);
  useEffect(async () => {
    const fileKeys = await keys();
    const filePromises = fileKeys.map(async (key) => get(key));
    setFiles(await Promise.all(filePromises));

    // When user drops files on the browser, create a new torrent and start seeding it!
    dragDrop('body', (droppedFiles) => {
      droppedFiles.forEach((file) => {
        client.seed(file, async (torrent) => {
          console.log(`Client is seeding ${torrent.magnetURI}`);
          await set(torrent.magnetURI, file);
          setFiles([...files, file]);
          console.log('original file', file);
          console.log('saved file', await get(torrent.magnetURI));
        });
      });
    });
  }, []);

  return html`<div>javi ${files.map((f) => f.name)}</div>`;
};

export default App;
