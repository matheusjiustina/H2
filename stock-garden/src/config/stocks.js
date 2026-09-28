/**
 * Stock catalogue. Each stock is a purely visual theme:
 * no stats, no prices — just colours and a plant builder (see src/plants).
 */
export const STOCKS = [
  {
    id: 'NVDA',
    plant: 'Circuit Fern',
    color: '#7bdc4f',
    accent: '#c6ff8e',
    ui: ['#7bdc4f', '#2f8f45'],
  },
  {
    id: 'AAPL',
    plant: 'Pearl Orchard',
    color: '#eef1f5',
    accent: '#f25f6b',
    ui: ['#f4f6f9', '#aab3c0'],
  },
  {
    id: 'TSLA',
    plant: 'Voltage Vine',
    color: '#ff4458',
    accent: '#8fe3ff',
    ui: ['#ff5a6b', '#b3182c'],
  },
  {
    id: 'AMZN',
    plant: 'Cargo Bush',
    color: '#ffa73a',
    accent: '#46e0cf',
    ui: ['#ffb14d', '#d66f12'],
  },
  {
    id: 'GOOGL',
    plant: 'Spectrum Bloom',
    color: '#5b95f7',
    accent: '#f6c343',
    palette: ['#5b95f7', '#ea5b4f', '#f6c343', '#3db36b'],
    ui: ['#5b95f7', '#3db36b'],
  },
  {
    id: 'PONS',
    plant: 'Aurum Crystal',
    color: '#e8c170',
    accent: '#a17cff',
    ui: ['#f2d08a', '#9b7bff'],
    rare: true,
  },
];

export const STOCK_MAP = Object.fromEntries(STOCKS.map((s) => [s.id, s]));
