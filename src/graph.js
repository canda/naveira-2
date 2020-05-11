import Chart from 'chart.js';

const chunkSize = 10;

export const graph = (values) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const chunks = Math.ceil((max - min) / chunkSize);

  const toRenderChunks = Array(chunks)
    .fill(null)
    .map((chunk, index) =>
      values.filter(
        (value) =>
          min + index * chunkSize <= value &&
          value < min + (index + 1) * chunkSize,
      ),
    );

  console.log('chunks.length', chunks.length);
  console.log('toRenderChunks', toRenderChunks);
  console.log(
    'toRenderChunks lengths',
    toRenderChunks.reduce((acc, chunk) => acc + chunk.length, 0),
  );

  console.log('chunks', chunks);

  const ctx = document.getElementById('myChart');
  const myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: toRenderChunks.map((x, index) => min + index * chunkSize),
      datasets: [
        {
          label: 'measurements',
          data: toRenderChunks.map((x) => x.length),
        },
      ],
      backgroundColor: toRenderChunks.map(() => 'rgba(153, 102, 255, 0.2)'),
    },
    options: {
      scales: {
        yAxes: [
          {
            ticks: {
              beginAtZero: true,
            },
          },
        ],
      },
    },
  });

  console.log(myChart);
};
