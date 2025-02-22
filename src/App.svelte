<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as Comlink from 'comlink';

  import SqliteWorker from './sqliteworker.ts?worker';
  import viteLogo from '/vite.svg'

  let sqlite: Awaited<import('./sqliteworker').SqliteType>;

  onMount(async () => {
    const worker = new SqliteWorker();
    sqlite = Comlink.wrap<import('./sqliteworker').SqliteType>(worker);

    try {
      await sqlite.openDb();
      console.log('Database opened.');
    } catch (err) {
      console.error('Error:', err);
    }
  });

  onDestroy(async () => {
    try {
      await sqlite.closeDb();
      console.log('Database closed.');
    } catch (err) {
      console.error('Error:', err);
    }
  });
</script>

<main>
  <div>
    <a href="https://vite.dev" target="_blank" rel="noreferrer">
      <img src={viteLogo} class="logo" alt="Vite Logo" />
    </a>
  </div>
  <h1>Basemaps</h1>

  <div class="card">
    <div id="log"></div>
  </div>
</main>

<style>
  .logo {
    height: 6em;
    padding: 1.5em;
    will-change: filter;
    transition: filter 300ms;
  }
  .logo:hover {
    filter: drop-shadow(0 0 2em #646cffaa);
  }
</style>
