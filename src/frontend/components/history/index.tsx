import React from 'react';
import { Sliders, History, Clock, Radio } from 'lucide-react';
import { SessionMeta } from '../index.js';

interface PlaybackSliderProps {
  sessions: SessionMeta[];
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
  events: any[];
  playbackIndex: number;
  onSetPlaybackIndex: (index: number) => void;
}

export function PlaybackSlider({ sessions, selectedSession, onSelectSession, events, playbackIndex, onSetPlaybackIndex }: PlaybackSliderProps) {
  const stepsCount = events.length;
  const isLive = playbackIndex === -1 || playbackIndex === stepsCount - 1;

  return (
    <div className="glass-panel" style={{
      display: 'flex', borderTop: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-secondary)', height: '140px', borderRadius: 0,
      padding: '0.8rem 1.5rem', gap: '2rem', alignItems: 'center'
    }}>
      {/* Session list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '360px', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
          <History size={12} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>SESSIONS</span>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1,
          overflowY: 'auto', paddingRight: '0.5rem'
        }}>
          {sessions.length === 0 ? (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Select a project first</span>
          ) : (
            sessions.slice(0, 50).map((s) => {
              const isSelected = selectedSession === s.sessionId;
              const time = new Date(s.modified).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              
              return (
                <div
                  key={s.sessionId}
                  onClick={() => onSelectSession(s.sessionId)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-active)' : '1px solid transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-primary)', fontWeight: isSelected ? 600 : 400 }}>
                    {s.sessionId.substring(0, 8)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{time}</span>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{(s.size / 1024).toFixed(0)}KB</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Playback slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, height: '100%', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Sliders size={12} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              TRANSCRIPT PLAYBACK
            </span>
          </div>
          {stepsCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              <span>Event {isLive ? stepsCount : playbackIndex + 1} of {stepsCount}</span>
              {isLive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#5d7c9a' }}>
                  <Radio size={10} />
                  <span>live</span>
                </div>
              )}
            </div>
          )}
        </div>

        {stepsCount <= 1 ? (
          <div style={{
            display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center',
            border: '1px dashed var(--border-color)', borderRadius: '4px',
            color: 'var(--text-muted)', fontSize: '0.7rem'
          }}>
            Select a session to load transcript
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
            <input
              type="range"
              min="0"
              max={stepsCount - 1}
              value={playbackIndex === -1 ? stepsCount - 1 : playbackIndex}
              onChange={(e) => onSetPlaybackIndex(parseInt(e.target.value, 10))}
              style={{
                flex: 1, height: '4px', backgroundColor: 'var(--bg-primary)',
                borderRadius: '2px', outline: 'none', cursor: 'pointer',
                accentColor: 'var(--accent-color)'
              }}
            />
            <button
              onClick={() => onSetPlaybackIndex(-1)}
              disabled={isLive}
              style={{
                backgroundColor: 'transparent', border: '1px solid var(--border-color)',
                color: isLive ? 'var(--text-muted)' : 'var(--text-primary)',
                borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.65rem',
                cursor: isLive ? 'not-allowed' : 'pointer'
              }}
            >
              Jump to Live
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
