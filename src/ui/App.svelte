<script>
  import List, { Item, Text } from '@smui/list';
  import IconButton, { Icon } from '@smui/icon-button';
  import {
    onChange as onFilesChange,
    add as addFile,
    remove as removeFile,
  } from '../services/filestore.js';
  import {
    onChange as onPlaylistChange,
    addSong as addSongToPlaylist,
    removeSongAtIndex,
  } from '../services/playlist';
  import { playlistSchedule } from '../services/music';

  let playlist = [];
  onPlaylistChange((newPlaylist) => {
    playlist = newPlaylist;
  });

  let libraryFiles = [];
  console.log('onFilesChange');
  onFilesChange((newFiles) => {
    libraryFiles = newFiles;
  });

  // When user drops files on the browser, create a new torrent and start seeding it!
  dragDrop('body', (droppedFiles) => {
    droppedFiles.forEach((blob) => addFile(blob));
  });
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

  .controls {
    position: fixed;
    bottom: 5px;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>

<main>
  <div class="lists">
    <div class="list playlist">
      <h1 class="mdc-typography--headline6">Playlist</h1>

      {#each playlist as song, index}
        <Item>
          <Text>
            {song.name}
            <div class="remove-icon">
              <IconButton
                class="material-icons"
                on:click={() => removeSongAtIndex(index)}>
                remove_circle
              </IconButton>
            </div>
          </Text>
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
  {#if playlist.length}
    <div class="controls">
      <IconButton
        class="material-icons"
        on:click={() => console.log('skip_previous')}>
        skip_previous
      </IconButton>
      <IconButton class="material-icons" on:click={() => console.log('pause')}>
        pause
      </IconButton>
      <IconButton
        class="material-icons"
        on:click={() => playlistSchedule(playlist)}>
        play_arrow
      </IconButton>
      <IconButton
        class="material-icons"
        on:click={() => console.log('skip_next')}>
        skip_next
      </IconButton>
      <IconButton class="material-icons" on:click={() => console.log('sync')}>
        sync
      </IconButton>
    </div>
  {/if}
</main>
