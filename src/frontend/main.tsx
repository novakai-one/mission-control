import React from 'react';
import ReactDOM from 'react-dom/client';
import { DashboardShell } from './components/index.js';
import './main.css';

// Reveal scrollbar thumbs only while their container is actively scrolling
// (css/index.css hides them otherwise). A data attribute, not a class, so
// React reconciliation never wipes it on re-render.
const scrollTimers = new WeakMap<Element, number>();
document.addEventListener('scroll', (scrollEvent) => {
  // Viewport scrolls target document itself; stamp the root element instead.
  const el = scrollEvent.target === document ? document.documentElement
    : scrollEvent.target instanceof Element ? scrollEvent.target : null;
  if (!el) return;
  if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '');
  window.clearTimeout(scrollTimers.get(el));
  scrollTimers.set(el, window.setTimeout(() => el.removeAttribute('data-scrolling'), 800));
}, { capture: true, passive: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DashboardShell />
  </React.StrictMode>
);
