'use client';

import React, { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import VideoInput from './VideoInput';
import Splitter from './Splitter';

interface VideoSlot {
  url: string;
  isExpanded: boolean;
}

export default function VideoGrid() {
  const [videoSlots, setVideoSlots] = useState<VideoSlot[]>([
    { url: '', isExpanded: false },
    { url: '', isExpanded: false },
    { url: '', isExpanded: false },
    { url: '', isExpanded: false },
  ]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [hideTopBar, setHideTopBar] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [showControlsButton, setShowControlsButton] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'expanded' | 'split'>('grid');
  const inactivityTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Adjustable border positions (percentages)
  const [gridVerticalSplit, setGridVerticalSplit] = useState<number>(50); // 50% - vertical split in 2x2 grid
  const [gridHorizontalSplit, setGridHorizontalSplit] = useState<number>(50); // 50% - horizontal split in 2x2 grid
  const [expandedVerticalSplit, setExpandedVerticalSplit] = useState<number>(75); // 75% - expanded video width (3fr = 75%)
  const [splitHorizontalSplit, setSplitHorizontalSplit] = useState<number>(75); // 75% - top video height

  // Track orientation changes
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.matchMedia('(orientation: portrait)').matches);
    };

    // Check on mount
    checkOrientation();

    // Listen for orientation changes
    const mediaQuery = window.matchMedia('(orientation: portrait)');
    const handler = () => checkOrientation();

    mediaQuery.addEventListener('change', handler);
    window.addEventListener('resize', checkOrientation);

    return () => {
      mediaQuery.removeEventListener('change', handler);
      window.removeEventListener('resize', checkOrientation);
    };
  }, []);

  // Load from localStorage and URL params on mount
  useEffect(() => {
    // Check URL parameters first (for shared links)
    const urlParams = new URLSearchParams(window.location.search);
    const urlVideos: VideoSlot[] = [
      { url: '', isExpanded: false },
      { url: '', isExpanded: false },
      { url: '', isExpanded: false },
      { url: '', isExpanded: false },
    ];

    let hasUrlVideos = false;
    for (let i = 0; i < 4; i++) {
      const urlParam = urlParams.get(`v${i}`);
      if (urlParam) {
        urlVideos[i].url = urlParam;
        hasUrlVideos = true;
      }
    }

    if (hasUrlVideos) {
      // Use URL params if available
      setVideoSlots(urlVideos);
    } else {
      // Fall back to localStorage
      const saved = localStorage.getItem('videoSlots');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setVideoSlots(parsed);
        } catch (e) {
          console.error('Failed to load saved video slots:', e);
        }
      }
    }

    // Load split positions
    const savedSplits = localStorage.getItem('splitPositions');
    if (savedSplits) {
      try {
        const parsed = JSON.parse(savedSplits);
        if (parsed.gridVerticalSplit) setGridVerticalSplit(parsed.gridVerticalSplit);
        if (parsed.gridHorizontalSplit) setGridHorizontalSplit(parsed.gridHorizontalSplit);
        if (parsed.expandedVerticalSplit) setExpandedVerticalSplit(parsed.expandedVerticalSplit);
        if (parsed.splitHorizontalSplit) setSplitHorizontalSplit(parsed.splitHorizontalSplit);
      } catch (e) {
        console.error('Failed to load saved split positions:', e);
      }
    }
  }, []);

  // Save to localStorage whenever videoSlots changes
  useEffect(() => {
    localStorage.setItem('videoSlots', JSON.stringify(videoSlots));
  }, [videoSlots]);

  // Save split positions to localStorage
  useEffect(() => {
    localStorage.setItem('splitPositions', JSON.stringify({
      gridVerticalSplit,
      gridHorizontalSplit,
      expandedVerticalSplit,
      splitHorizontalSplit,
    }));
  }, [gridVerticalSplit, gridHorizontalSplit, expandedVerticalSplit, splitHorizontalSplit]);

  // Handle ESC key to exit expand mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVideoSlots((slots) =>
          slots.map((slot) => ({ ...slot, isExpanded: false }))
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // In expanded mode, always keep the focused video expanded
  useEffect(() => {
    if (layoutMode === 'expanded') {
      setVideoSlots((slots) =>
        slots.map((slot, i) => ({
          ...slot,
          isExpanded: i === focusedIndex,
        }))
      );
    }
  }, [focusedIndex, layoutMode]);

  // Handle cursor inactivity to hide "Show Controls" button
  useEffect(() => {
    if (!hideTopBar) {
      // If top bar is visible, always show the button (button is hidden anyway)
      setShowControlsButton(true);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const resetInactivityTimer = () => {
      // Show the button
      setShowControlsButton(true);

      // Clear existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Set new timer to hide button after 7 seconds
      inactivityTimerRef.current = setTimeout(() => {
        setShowControlsButton(false);
      }, 7000);
    };

    // Initialize timer
    resetInactivityTimer();

    // Add mouse move listener
    window.addEventListener('mousemove', resetInactivityTimer);

    return () => {
      window.removeEventListener('mousemove', resetInactivityTimer);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [hideTopBar]);

  const handleSetUrl = (quadrantIndex: number, url: string) => {
    setVideoSlots((slots) =>
      slots.map((slot, i) =>
        i === quadrantIndex ? { ...slot, url } : slot
      )
    );
    setFocusedIndex(quadrantIndex);
  };

  const handleToggleExpand = (quadrantIndex: number) => {
    // In split mode, clicking toggles focus instead of expand
    if (layoutMode === 'split') {
      setFocusedIndex(quadrantIndex);
      return;
    }

    // In expanded mode, clicking always expands the clicked video
    if (layoutMode === 'expanded') {
      setFocusedIndex(quadrantIndex);
      setVideoSlots((slots) =>
        slots.map((slot, i) => ({
          ...slot,
          isExpanded: i === quadrantIndex,
        }))
      );
      return;
    }

    // In grid mode, clicking toggles expand/collapse
    setVideoSlots((slots) => {
      const currentlyExpanded = slots[quadrantIndex].isExpanded;

      // If clicking on an already expanded video, collapse it
      if (currentlyExpanded) {
        return slots.map((slot, i) =>
          i === quadrantIndex ? { ...slot, isExpanded: false } : slot
        );
      }

      // If clicking on a non-expanded video, collapse all others and expand this one
      return slots.map((slot, i) =>
        i === quadrantIndex
          ? { ...slot, isExpanded: true }
          : { ...slot, isExpanded: false }
      );
    });
  };

  const handleResetLayout = () => {
    // Reset all split positions to default values
    setGridVerticalSplit(50);
    setGridHorizontalSplit(50);
    setExpandedVerticalSplit(75);
    setSplitHorizontalSplit(75);
  };

  return (
    <div className="w-screen h-screen bg-black flex flex-col overflow-hidden">
      {/* URL Input Bar */}
      {!hideTopBar && (
        <div className="bg-zinc-900 border-b border-zinc-800 p-4">
          <VideoInput
            onSetUrl={handleSetUrl}
            focusedIndex={focusedIndex}
            videoSlots={videoSlots}
            onToggleTopBar={() => setHideTopBar(!hideTopBar)}
            layoutMode={layoutMode}
            onToggleLayout={() => {
              const modes: ('grid' | 'expanded' | 'split')[] = ['grid', 'expanded', 'split'];
              const currentIndex = modes.indexOf(layoutMode);
              const nextIndex = (currentIndex + 1) % modes.length;
              const nextMode = modes[nextIndex];

              setLayoutMode(nextMode);

              // Handle mode-specific behavior
              if (nextMode === 'expanded') {
                // Auto-expand the focused video when entering expanded mode
                setVideoSlots((slots) =>
                  slots.map((slot, i) => ({
                    ...slot,
                    isExpanded: i === focusedIndex,
                  }))
                );
              } else if (nextMode === 'split') {
                // Reset expanded states when switching to split mode
                setVideoSlots((slots) =>
                  slots.map((slot) => ({ ...slot, isExpanded: false }))
                );
              } else {
                // Reset expanded states when switching to grid mode
                setVideoSlots((slots) =>
                  slots.map((slot) => ({ ...slot, isExpanded: false }))
                );
              }
            }}
            onResetLayout={handleResetLayout}
          />
        </div>
      )}

      {/* Show/Hide Top Bar Button (when hidden) */}
      {hideTopBar && showControlsButton && (
        <button
          onClick={() => setHideTopBar(false)}
          className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-zinc-900/90 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-300 z-50 flex items-center gap-2"
          title="Show controls"
        >
          <span>⬇️</span>
          <span>Show Controls</span>
        </button>
      )}

      {/* Responsive Video Grid with adjustable borders */}
      <div
        className={`flex-1 bg-zinc-950 ${isPortrait ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{ position: 'relative' }}
      >
        {/* Always render all 4 VideoPlayers with stable positions */}
        {(() => {
          const anyExpanded = videoSlots.some(s => s.isExpanded);
          const expandedIndex = videoSlots.findIndex(s => s.isExpanded);

          return [0, 1, 2, 3].map((index) => {
            // Calculate position based on current layout mode and orientation
            let style: React.CSSProperties = { position: 'absolute', padding: '4px' };

            if (isPortrait) {
              // Portrait mode: Stack vertically
              const heightPercent = 25; // 100% / 4 videos
              style = {
                ...style,
                top: `${index * heightPercent}%`,
                left: 0,
                right: 0,
                height: `${heightPercent}%`
              };
            } else if (layoutMode === 'split') {
              if (index === focusedIndex) {
                // Top video (focused)
                style = { ...style, top: 0, left: 0, right: 0, height: `${splitHorizontalSplit}%` };
              } else {
                // Bottom 3 videos
                const otherIndices = [0, 1, 2, 3].filter(i => i !== focusedIndex);
                const bottomPos = otherIndices.indexOf(index);
                const widthPercent = 100 / 3;
                style = {
                  ...style,
                  top: `${splitHorizontalSplit}%`,
                  left: `${bottomPos * widthPercent}%`,
                  width: `${widthPercent}%`,
                  bottom: 0
                };
              }
            } else if (anyExpanded && layoutMode !== 'grid') {
              // Expanded mode
              if (index === expandedIndex) {
                // Left expanded video
                style = { ...style, top: 0, left: 0, width: `${expandedVerticalSplit}%`, bottom: 0 };
              } else {
                // Right stacked videos
                const otherIndices = [0, 1, 2, 3].filter(i => i !== expandedIndex);
                const stackPos = otherIndices.indexOf(index);
                const heightPercent = 100 / 3;
                style = {
                  ...style,
                  top: `${stackPos * heightPercent}%`,
                  left: `${expandedVerticalSplit}%`,
                  right: 0,
                  height: `${heightPercent}%`
                };
              }
            } else {
              // Grid mode: 2x2
              const row = Math.floor(index / 2);
              const col = index % 2;
              style = {
                ...style,
                top: row === 0 ? 0 : `${gridHorizontalSplit}%`,
                left: col === 0 ? 0 : `${gridVerticalSplit}%`,
                width: col === 0 ? `${gridVerticalSplit}%` : `${100 - gridVerticalSplit}%`,
                height: row === 0 ? `${gridHorizontalSplit}%` : `${100 - gridHorizontalSplit}%`
              };
            }

            return (
              <div key={index} style={style}>
                <VideoPlayer
                  key={`video-player-${index}`}
                  url={videoSlots[index].url}
                  quadrantIndex={index}
                  isFocused={focusedIndex === index}
                  isExpanded={videoSlots[index].isExpanded}
                  onFocus={() => setFocusedIndex(index)}
                  onToggleExpand={() => handleToggleExpand(index)}
                />
              </div>
            );
          });
        })()}

        {/* Render splitters on top (only in landscape mode) */}
        {!isPortrait && layoutMode === 'split' && (
          <div style={{ position: 'absolute', top: `${splitHorizontalSplit}%`, left: 0, right: 0, transform: 'translateY(-50%)', zIndex: 1000 }}>
            <Splitter
              direction="horizontal"
              onDrag={(delta) => {
                const container = document.querySelector('.flex-1') as HTMLElement;
                if (!container) return;
                const containerHeight = container.clientHeight;
                const deltaPercent = (delta / containerHeight) * 100;
                setSplitHorizontalSplit(Math.max(20, Math.min(80, splitHorizontalSplit + deltaPercent)));
              }}
            />
          </div>
        )}

        {!isPortrait && videoSlots.some(s => s.isExpanded) && layoutMode !== 'split' && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${expandedVerticalSplit}%`, transform: 'translateX(-50%)', zIndex: 1000 }}>
            <Splitter
              direction="vertical"
              onDrag={(delta) => {
                const container = document.querySelector('.flex-1') as HTMLElement;
                if (!container) return;
                const containerWidth = container.clientWidth;
                const deltaPercent = (delta / containerWidth) * 100;
                setExpandedVerticalSplit(Math.max(50, Math.min(90, expandedVerticalSplit + deltaPercent)));
              }}
            />
          </div>
        )}

        {!isPortrait && !videoSlots.some(s => s.isExpanded) && layoutMode === 'grid' && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${gridVerticalSplit}%`, transform: 'translateX(-50%)', zIndex: 1000 }}>
              <Splitter
                direction="vertical"
                onDrag={(delta) => {
                  const container = document.querySelector('.flex-1') as HTMLElement;
                  if (!container) return;
                  const containerWidth = container.clientWidth;
                  const deltaPercent = (delta / containerWidth) * 100;
                  setGridVerticalSplit(Math.max(20, Math.min(80, gridVerticalSplit + deltaPercent)));
                }}
              />
            </div>
            <div style={{ position: 'absolute', top: `${gridHorizontalSplit}%`, left: 0, right: 0, transform: 'translateY(-50%)', zIndex: 1000 }}>
              <Splitter
                direction="horizontal"
                onDrag={(delta) => {
                  const container = document.querySelector('.flex-1') as HTMLElement;
                  if (!container) return;
                  const containerHeight = container.clientHeight;
                  const deltaPercent = (delta / containerHeight) * 100;
                  setGridHorizontalSplit(Math.max(20, Math.min(80, gridHorizontalSplit + deltaPercent)));
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

