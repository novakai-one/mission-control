// Shadow-DOM scene host: the prototype's own fragment + CSS render inside a
// shadow root — full style fidelity, zero bleed into the studio, real DOM so
// linked mentions can light scene objects later. Construction is DOM-node
// based, never string interpolation: css goes into style.textContent, the
// framing rules are a fixed constant, and the active scene is chosen by
// exact attribute comparison — untrusted values never enter markup.
import React, { useEffect, useRef } from 'react';
import './index.css';

/** Fixed framing: only the active top-level scene root is visible. */
const FRAMING_CSS = [
  '.nvk-scene-stage > * { display: none; }',
  '.nvk-scene-stage > .nvk-scene-active { display: revert; }',
].join('\n');

interface SceneHostProps {
  fragment: string;
  css: string;
  activeRootId: string | null;
}

export function SceneHost({ fragment, css: stylesheet, activeRootId }: SceneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Rebuild only when the document changes; scene switches just retoggle.
  useEffect(() => {
    if (!hostRef.current) return;
    shadowRef.current ??= hostRef.current.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${stylesheet}\n${FRAMING_CSS}`;
    const stage = document.createElement('div');
    stage.className = 'nvk-scene-stage';
    stage.innerHTML = fragment; // sanitized at the adapter boundary
    stageRef.current = stage;
    shadowRef.current.replaceChildren(style, stage);
  }, [fragment, stylesheet]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    for (const child of Array.from(stage.children)) {
      child.classList.toggle('nvk-scene-active', child.getAttribute('data-nb-id') === activeRootId);
    }
  }, [fragment, stylesheet, activeRootId]);

  return <div className="design-scene-host" ref={hostRef} />;
}
