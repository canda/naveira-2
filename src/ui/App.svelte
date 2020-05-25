<script>
  import List, { Item, Text } from '@smui/list';

  let fruits = ['Apple', 'Orange', 'Banana', 'Mango'];
</script>

<style>
  main {
    text-align: center;
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }

  h1 {
    color: #ff3e00;
    text-transform: uppercase;
    font-size: 4em;
    font-weight: 100;
  }

  @media (min-width: 640px) {
    main {
      max-width: none;
    }
  }
</style>

<main>
  <List>
    {#each fruits as fruit}
      <Item>
        <Text>{fruit}</Text>
      </Item>
    {/each}
  </List>
  <p>
    Visit the
    <a href="https://svelte.dev/tutorial">Svelte tutorial</a>
    to learn how to build Svelte apps.
  </p>
</main>
