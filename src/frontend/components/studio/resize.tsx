// Persisted panel widths (codex IA contract: widths/open state survive
// reload). Two drag seams live in the stage gutters between the framed
// panels — invisible until used (the drawer rule: the handle appears only
// while it matters), a hairline while dragging. Widths write CSS variables
// on .studio-app and persist debounced; reload restores the exact geometry.
import React, { useEffect, useRef } from 'react';

const WIDTHS_KEY = 'novakai-studio-widths-v1';

interface PanelWidths {
  railPx?: number;
  aiPct?: number;
}

export function loadWidths(): PanelWidths {
  try {
    return JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as PanelWidths;
  } catch {
    return {};
  }
}

function saveWidths(widths: PanelWidths): void {
  try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths)); } catch { /* geometry only */ }
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Applies persisted widths to the .studio-app grid and returns drag seams to
 * render inside it. Pure geometry: no re-render on drag, no layout state in
 * React — the grid variables are the single source. */
export function StudioResizeSeams() {
  const appRef = useRef<HTMLElement | null>(null);
  const widthsRef = useRef<PanelWidths>(loadWidths());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.studio-app');
    appRef.current = app;
    if (!app) return;
    const { railPx, aiPct } = widthsRef.current;
    if (railPx) app.style.setProperty('--st-rail-w', `${railPx}px`);
    if (aiPct) app.style.setProperty('--st-ai-w', `${aiPct}%`);
  }, []);

  function persistSoon(): void {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveWidths(widthsRef.current), 250);
  }

  function beginDrag(seam: 'rail' | 'ai', press: React.PointerEvent<HTMLDivElement>): void {
    const app = appRef.current;
    if (!app) return;
    press.preventDefault();
    const handle = press.currentTarget;
    handle.setPointerCapture(press.pointerId);
    handle.setAttribute('data-dragging', '');
    const appBox = app.getBoundingClientRect();

    function move(drag: PointerEvent): void {
      if (seam === 'rail') {
        const railPx = Math.round(clamp(drag.clientX - appBox.left, 180, 340));
        widthsRef.current.railPx = railPx;
        app!.style.setProperty('--st-rail-w', `${railPx}px`);
      } else {
        const aiPct = clamp(((appBox.right - drag.clientX) / appBox.width) * 100, 24, 48);
        widthsRef.current.aiPct = Math.round(aiPct * 10) / 10;
        app!.style.setProperty('--st-ai-w', `${widthsRef.current.aiPct}%`);
      }
      persistSoon();
    }

    function up(): void {
      handle.removeAttribute('data-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <>
      <div
        className="studio-seam studio-seam-rail"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize rail"
        onPointerDown={(press) => beginDrag('rail', press)}
      />
      <div
        className="studio-seam studio-seam-ai"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize AI panel"
        onPointerDown={(press) => beginDrag('ai', press)}
      />
    </>
  );
}
