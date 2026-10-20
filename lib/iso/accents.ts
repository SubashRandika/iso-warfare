// Same names and order as the 2D iso-glow galleries. Only the near-white accent gets a darker light-theme variant.
export type Theme = 'dark' | 'light';
export const ACCENTS = [
  { id: 'ember', name: 'Ember', dark: '#ff9d3c', light: '#ff9d3c' },
  { id: 'cyan', name: 'Cyan', dark: '#22d3ee', light: '#22d3ee' },
  { id: 'lime', name: 'Lime', dark: '#a3e635', light: '#a3e635' },
  { id: 'violet', name: 'Violet', dark: '#a78bfa', light: '#a78bfa' },
  { id: 'rose', name: 'Rose', dark: '#fb7185', light: '#fb7185' },
  { id: 'ice', name: 'Ice', dark: '#dfe9ef', light: '#5d7d90' },
] as const;
export type AccentId = (typeof ACCENTS)[number]['id'];
