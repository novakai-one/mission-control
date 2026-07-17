// Markdown → React for transcript prose, in the studio's calm register:
// headers are weight (never hero sizes), code blocks are quiet panel-3
// surfaces, links are ink with a faint underline. Content is never treated
// as HTML — everything renders through React text nodes. `renderText` lets
// callers keep their own plain-text treatment (e.g. linked mentions) on the
// literal leaves without re-parsing the markdown.
import React, { useMemo } from 'react';
import { parseMarkdown, type BlockNode, type InlineNode } from './parse.js';
import './index.css';

export type RenderTextFn = (text: string) => React.ReactNode;

interface InlineProps {
  nodes: InlineNode[];
  renderText?: RenderTextFn;
}

function InlineSpan({ node, renderText }: { node: InlineNode; renderText?: RenderTextFn }) {
  if (node.type === 'strong') return <strong className="md-strong">{node.text}</strong>;
  if (node.type === 'em') return <em className="md-em">{node.text}</em>;
  if (node.type === 'code') return <code className="md-code">{node.text}</code>;
  if (node.type === 'link') {
    return <a className="md-link" href={node.href} target="_blank" rel="noopener noreferrer">{node.text}</a>;
  }
  return <>{renderText ? renderText(node.text) : node.text}</>;
}

function InlineRun({ nodes, renderText }: InlineProps) {
  return (
    <>
      {nodes.map((node, index) => <InlineSpan key={index} node={node} renderText={renderText} />)}
    </>
  );
}

function ListBlock({ block, renderText }: { block: BlockNode & { type: 'list' }; renderText?: RenderTextFn }) {
  const items = block.items.map((item, index) => (
    <li key={index}><InlineRun nodes={item} renderText={renderText} /></li>
  ));
  return block.ordered
    ? <ol className="md-list">{items}</ol>
    : <ul className="md-list">{items}</ul>;
}

function Block({ block, renderText }: { block: BlockNode; renderText?: RenderTextFn }) {
  if (block.type === 'heading') {
    return <p className="md-h" data-level={block.level}><InlineRun nodes={block.inline} renderText={renderText} /></p>;
  }
  if (block.type === 'codeblock') return <pre className="md-pre" data-lang={block.lang}><code>{block.text}</code></pre>;
  if (block.type === 'list') return <ListBlock block={block} renderText={renderText} />;
  return <p className="md-p"><InlineRun nodes={block.inline} renderText={renderText} /></p>;
}

export interface MarkdownTextProps {
  text: string;
  /** Applied to plain-text leaves only — formatted spans stay as-is. */
  renderText?: RenderTextFn;
}

/** Transcript prose rendered as calm markdown. */
export function MarkdownText({ text, renderText }: MarkdownTextProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="md-prose">
      {blocks.map((block, index) => <Block key={index} block={block} renderText={renderText} />)}
    </div>
  );
}
