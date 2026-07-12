// App-wide theme/font selection. The boot script in index.html applies the
// persisted values before first paint; this module owns the lists and the
// runtime switch. Non-React consumers (xterm) listen for 'mc-theme-changed'.

export interface ThemeDef {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  /** Swatch colors for the picker (bg fill + accent dot). */
  bg: string;
  accent: string;
}

// KEEP IN SYNC: theme id list also lives in css/index.css (:root[data-theme=...] rules) and index.html (boot script light-theme list).
export const THEMES: ThemeDef[] = [
  { id: 'command', name: 'Command', mode: 'dark', bg: '#0d0d0f', accent: '#d6a54c' },
  { id: 'carbon', name: 'Carbon', mode: 'dark', bg: '#161616', accent: '#cfcfcc' },
  { id: 'onyx', name: 'Onyx', mode: 'dark', bg: '#101112', accent: '#7fa8d8' },
  { id: 'ink', name: 'Ink', mode: 'dark', bg: '#0f1114', accent: '#b8bcc2' },
  { id: 'graphite', name: 'Graphite', mode: 'light', bg: '#f1f1ef', accent: '#3a3a38' },
  { id: 'fog', name: 'Fog', mode: 'light', bg: '#eef0f2', accent: '#3a5a7a' },
  { id: 'slate', name: 'Slate', mode: 'light', bg: '#eceef1', accent: '#4a5a72' },
];

export const FONTS: { id: string; name: string }[] = [
  { id: 'source-serif', name: 'Source Serif 4' },
  { id: 'newsreader', name: 'Newsreader' },
  { id: 'inter', name: 'Inter' },
  { id: 'hanken', name: 'Hanken Grotesk' },
  { id: 'plex', name: 'IBM Plex Sans' },
];

export const THEME_CHANGED_EVENT = 'mc-theme-changed';

export function currentTheme(): string {
  return document.documentElement.dataset.theme || 'command';
}

export function currentFont(): string {
  return document.documentElement.dataset.font || 'plex';
}

export function applyTheme(id: string): void {
  const theme = THEMES.find((entry) => entry.id === id) ?? THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  localStorage.setItem('mc-theme', theme.id);
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}

export function applyFont(id: string): void {
  document.documentElement.dataset.font = id;
  localStorage.setItem('mc-font', id);
}
