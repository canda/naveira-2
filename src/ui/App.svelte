<script>
  import List, { Item, Text } from '@smui/list';
  import IconButton, { Icon } from '@smui/icon-button';
  import { getAll, save, remove } from '../services/filestore.js';
  import { seed } from '../services/webtorrent';
  import {
    onChange as onPlaylistChange,
    addSong as addSongToPlaylist,
  } from '../services/playlist';

  let playlist = [];
  onPlaylistChange((newPlaylist) => {
    playlist = newPlaylist;
  });

  let libraryFiles = [];
  const getSavedFiles = async () => {
    const files = await getAll();
    libraryFiles = files;
    files.forEach((file) => seed(file));
  };
  getSavedFiles();

  // When user drops files on the browser, create a new torrent and start seeding it!
  dragDrop('body', (droppedFiles) => {
    droppedFiles.forEach(async (blob) => {
      const file = await seed(blob);
      libraryFiles = [...libraryFiles, file];
      save(torrent.magnetURI, file);
    });
  });

  const removeFile = (magnetURI) => {
    libraryFiles = libraryFiles.filter((file) => file.magnetURI !== magnetURI);
    remove(magnetURI);
  };
</script>

<style>
  .lists {
    display: flex;
  }
  .list {
    flex: 1;
  }
  .remove-icon {
    position: relative;
    top: 5px;
    display: inline-block;
  }
</style>

<main>
  <div class="lists">
    <div class="list playlist">
      <h1 class="mdc-typography--headline6">Playlist</h1>

      {#each playlist as file}
        <Item>
          <Text>{file.name}</Text>
        </Item>
      {/each}
    </div>
    <div class="list library">
      <List>
        <h1 class="mdc-typography--headline6">Local Library</h1>
        {#each libraryFiles as file}
          <Item
            on:click={() => {
              addSongToPlaylist(file);
            }}>
            <Text>
              {file.name}
              <div class="remove-icon">
                <IconButton
                  class="material-icons"
                  on:click={() => removeFile(file.magnetURI)}>
                  remove_circle
                </IconButton>
              </div>
            </Text>
          </Item>
        {/each}
      </List>
    </div>
  </div>
</main>
