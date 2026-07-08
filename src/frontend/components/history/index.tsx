import React from 'react';
import { Sliders, History, Calendar, GitCommit } from 'lucide-react';
import { BuildRecord } from '../index.js';

interface PlaybackSliderProps {
  activeBuild: BuildRecord | null;
  playbackIndex: number;
  onSetPlaybackIndex: (index: number) => void;
  builds: BuildRecord[];
  onReviewBuild: (build: BuildRecord) => void;
}

export function PlaybackSlider({ activeBuild, playbackIndex, onSetPlaybackIndex, builds, onReviewBuild }: PlaybackSliderProps) {
  const stepsCount = activeBuild?.steps.length || 0;

  return (
    <div className="glass-panel" style={{
      display: 'flex', borderTop: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-secondary)', height: '140px', borderRadius: 0,
      padding: '0.8rem 1.5rem', gap: '2rem', alignItems: 'center'
    }}>
      {/* Historical Runs Scroller */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '280px', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
          <History size={12} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>RUN TRANSCRIPT HISTORY</span>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1,
          overflowY: 'auto', paddingRight: '0.5rem'
        }}>
          {builds.length === 0 ? (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No past runs logged</span>
          ) : (
            builds.map((build) => {
              const isSelected = activeBuild?.id === build.id;
              const formattedTime = new Date(build.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              return (
                <div
                  key={build.id}
                  onClick={() => onReviewBuild(build)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-active)' : '1px solid transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)', fontWeight: isSelected ? 600 : 400 }}>
                    {build.id.substring(6)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formattedTime}</span>
                    <span style={{
                      fontSize: '0.55rem', padding: '0.05rem 0.3rem', borderRadius: '2px',
                      backgroundColor: build.status === 'success' ? '#25352c' : build.status === 'failed' ? '#3d2527' : '#222831',
                      color: build.status === 'success' ? '#8bc34a' : build.status === 'failed' ? '#e57373' : 'var(--text-secondary)'
                    }}>
                      {build.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Transcript Playback Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, height: '100%', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Sliders size={12} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              TRANSCRIPT STEP REVIEW SLIDER
            </span>
          </div>
          {activeBuild && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              <span>Step {playbackIndex === -1 ? stepsCount : playbackIndex + 1} of {stepsCount}</span>
              {activeBuild.gitCommitHash && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#688c7d' }}>
                  <GitCommit size={10} />
                  <span>git: {activeBuild.gitCommitHash.substring(0, 7)}</span>
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
            Select a past run or trigger an active build to explore playback step-by-step
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
              onClick={() => onSetPlaybackIndex(stepsCount - 1)}
              disabled={playbackIndex === -1 || playbackIndex === stepsCount - 1}
              style={{
                backgroundColor: 'transparent', border: '1px solid var(--border-color)',
                color: (playbackIndex === -1 || playbackIndex === stepsCount - 1) ? 'var(--text-muted)' : 'var(--text-primary)',
                borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.65rem',
                cursor: (playbackIndex === -1 || playbackIndex === stepsCount - 1) ? 'not-allowed' : 'pointer'
              }}
            >
              Reset to Live
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
