<script lang="typescript">
  import List, { Item, Text } from '@smui/list';
  import IconButton, { Icon } from '@smui/icon-button';
  import {
    onChange as onFilesChange,
    add as addFile,
    remove as removeFile,
    File,
  } from '../services/filestore';
  import {
    onChange as onPlaylistChange,
    addSong as addSongToPlaylist,
    removeSongAtIndex,
    Playlist,
  } from '../services/playlist';
  import { onChange as onScheduleChange, play } from '../services/schedule';
  import {
    speeds,
    torrentProgresses as torrentProgressesObservable,
  } from '../services/webtorrent';

  let playlist: Playlist = [];
  onPlaylistChange((newPlaylist) => {
    playlist = newPlaylist;
  });

  let libraryFiles: File[] = [];
  onFilesChange((newFiles) => {
    libraryFiles = newFiles;
  });

  let schedule;
  onScheduleChange((newSchedule) => {
    schedule = newSchedule;
  });

  // When user drops files on the browser, create a new torrent and start seeding it!
  dragDrop('body', (droppedFiles) => {
    droppedFiles.forEach((file) => addFile({ name: file.name, blob: file }));
  });

  let downloadSpeed = 0;
  let uploadSpeed = 0;
  speeds.subscribeToValue((newValue) => {
    downloadSpeed = newValue.downloadSpeed;
    uploadSpeed = newValue.uploadSpeed;
  });

  let torrentProgresses = [];
  torrentProgressesObservable.subscribeToValue((newTorrentProgresses) => {
    torrentProgresses = newTorrentProgresses;
  });
</script>

<style>
  .lists-container {
    display: flex;
    height: 100%;
  }
  .speeds {
    font-size: 12px;
    color: #999;
  }
  .unit {
    font-size: 8px;
  }
  .progress {
    background: #ff3e00;
    height: 3px;
  }
  .list {
    flex: 1;
    position: relative;
    height: 100%;
  }
  .list .title {
    height: 57px;
    text-align: center;
  }
  .instructions {
    color: #666;
    position: absolute;
    top: 50%;
    width: 100%;
    text-align: center;
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

  @media (max-width: 500px) {
    .lists-container {
      flex-direction: column;
    }
  }
</style>

<div class="lists-container">
  <div class="list playlist">
    <h1 class="mdc-typography--headline6 title">Playlist</h1>

    {#if !playlist.length && libraryFiles.length}
      <span class="instructions">
        Click on some library songs to make a playlist
      </span>
    {/if}

    {#each playlist as song, index}
      <div class="song">
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
        <div
          class="progress"
          style="width: {Math.round((torrentProgresses.find((t) => t.magnetURI === song.magnetURI) || { progress: 0 }).progress * 100)}%" />
      </div>
    {/each}
  </div>
  <div class="list library">
    <List>
      <h1 class="mdc-typography--headline6 title">
        Library
        <br />
        <span class="speeds">
          {Math.round(downloadSpeed / 100) / 10}
          <span class="unit">KB/s</span>
          | {Math.round(uploadSpeed / 100) / 10}
          <span class="unit">KB/s</span>
        </span>
      </h1>
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
{#if !playlist.length && !libraryFiles.length}
  <span class="instructions">Drag and drop some mp3 files here</span>
{/if}
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
    <IconButton class="material-icons" on:click={() => play()}>
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
