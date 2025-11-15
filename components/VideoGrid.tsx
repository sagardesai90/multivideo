'use client';

import React, { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import VideoInput from './VideoInput';
import Splitter from './Splitter';

interface VideoSlot {
  url: string;
  isExpanded: boolean;
}

// Track the display order of slots (which slot appears in which position)
// slotOrder[position] = slotIndex (e.g., slotOrder[0] = 2 means slot 2 is displayed in position 0)

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
  const [singleVideoMode, setSingleVideoMode] = useState<boolean>(false);
  const [numSlots, setNumSlots] = useState<number>(4);
  const inactivityTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Slot order - maps visual position to slot index
  // This allows us to reorder visually without changing URL data (prevents stream reload)
  const [slotOrder, setSlotOrder] = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  // Drag and drop state - using custom mouse-based approach for iframe compatibility
  const [draggedPosition, setDraggedPosition] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null);
  const slotRefs = React.useRef<(HTMLDivElement | null)[]>([]);

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
    // Load number of slots and single video mode
    const savedNumSlots = localStorage.getItem('numSlots');
    if (savedNumSlots) {
      try {
        const parsed = parseInt(savedNumSlots, 10);
        if (parsed >= 1 && parsed <= 9) {
          setNumSlots(parsed);
        }
      } catch (e) {
        console.error('Failed to load saved numSlots:', e);
      }
    }

    const savedSingleVideoMode = localStorage.getItem('singleVideoMode');
    if (savedSingleVideoMode === 'true') {
      setSingleVideoMode(true);
    }

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

  // Save slot order to localStorage
  useEffect(() => {
    localStorage.setItem('slotOrder', JSON.stringify(slotOrder));
  }, [slotOrder]);

  // Load slot order from localStorage on mount
  useEffect(() => {
    const savedSlotOrder = localStorage.getItem('slotOrder');
    if (savedSlotOrder) {
      try {
        const parsed = JSON.parse(savedSlotOrder);
        if (Array.isArray(parsed)) {
          setSlotOrder(parsed);
        }
      } catch (e) {
        console.error('Failed to load saved slot order:', e);
      }
    }
  }, []);

  // Save number of slots and single video mode
  useEffect(() => {
    localStorage.setItem('numSlots', numSlots.toString());
  }, [numSlots]);

  useEffect(() => {
    localStorage.setItem('singleVideoMode', singleVideoMode.toString());
  }, [singleVideoMode]);

  // Sync videoSlots array length with numSlots
  useEffect(() => {
    setVideoSlots((slots) => {
      const newSlots = [...slots];
      // Add slots if needed
      while (newSlots.length < numSlots) {
        newSlots.push({ url: '', isExpanded: false });
      }
      // Remove slots if needed (but keep URLs)
      if (newSlots.length > numSlots) {
        return newSlots.slice(0, numSlots);
      }
      return newSlots;
    });
    // Ensure focusedIndex is valid
    if (focusedIndex >= numSlots) {
      setFocusedIndex(Math.max(0, numSlots - 1));
    }
  }, [numSlots]);

  const handleAddSlot = () => {
    if (numSlots < 9) {
      setNumSlots(numSlots + 1);
    }
  };

  const handleRemoveSlot = () => {
    if (numSlots > 1) {
      const newNumSlots = numSlots - 1;
      setNumSlots(newNumSlots);
      // Clear the last slot's URL if it exists
      setVideoSlots((slots) => {
        const newSlots = [...slots];
        if (newSlots.length > newNumSlots && newSlots[newNumSlots]?.url) {
          newSlots[newNumSlots] = { ...newSlots[newNumSlots], url: '' };
        }
        return newSlots.slice(0, newNumSlots);
      });
      // Adjust focusedIndex if needed
      if (focusedIndex >= newNumSlots) {
        setFocusedIndex(Math.max(0, newNumSlots - 1));
      }
    }
  };

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

  // Handle tap anywhere on screen to show controls button (mobile)
  const handleScreenTap = (e: React.TouchEvent | React.MouseEvent) => {
    if (!hideTopBar) return; // Only work when top bar is hidden

    // Show the button on any tap
    setShowControlsButton(true);

    // Reset inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Set timer to hide button after 7 seconds
    inactivityTimerRef.current = setTimeout(() => {
      setShowControlsButton(false);
    }, 7000);
  };

  const handleSetUrl = (quadrantIndex: number, url: string) => {
    setVideoSlots((slots) =>
      slots.map((slot, i) =>
        i === quadrantIndex ? { ...slot, url } : slot
      )
    );
    setFocusedIndex(quadrantIndex);
  };

  // Mouse-based drag and drop handlers (works better with iframes than HTML5 DnD)
  const handleMouseDown = React.useCallback((position: number) => {
    console.log(`[MouseDown] Position ${position} - Starting drag`);
    setDraggedPosition(position);
  }, []);

  const handleMouseEnter = React.useCallback((position: number) => {
    if (draggedPosition !== null && draggedPosition !== position) {
      console.log(`[MouseEnter] Position ${position} - Hovering over (from position ${draggedPosition})`);
      setDragOverPosition(position);
    }
  }, [draggedPosition]);

  const handleMouseLeave = React.useCallback((position: number) => {
    if (dragOverPosition === position) {
      setDragOverPosition(null);
    }
  }, [dragOverPosition]);

  const handleMouseUp = React.useCallback((targetPosition: number) => {
    const sourcePosition = draggedPosition;
    console.log(`[MouseUp] Position ${targetPosition} - Mouse up (from position ${sourcePosition})`);

    // Reset visual states
    setDraggedPosition(null);
    setDragOverPosition(null);

    // Validate positions
    if (sourcePosition === null || sourcePosition === targetPosition) {
      console.log(`[MouseUp] Cancelled - same position or null source`);
      return;
    }

    if (sourcePosition < 0 || sourcePosition >= numSlots ||
      targetPosition < 0 || targetPosition >= numSlots) {
      console.log(`[MouseUp] Cancelled - invalid positions`);
      return;
    }

    console.log(`[Swap] Swapping position ${sourcePosition} with position ${targetPosition}`);

    // Swap the slot order - this changes which slot appears in which position
    // WITHOUT changing the slot's URL data, so streams don't reload!
    setSlotOrder((order) => {
      const newOrder = [...order];
      const temp = newOrder[sourcePosition];
      newOrder[sourcePosition] = newOrder[targetPosition];
      newOrder[targetPosition] = temp;
      console.log(`[Swap] New order: ${newOrder.slice(0, numSlots).join(', ')}`);
      return newOrder;
    });

    // Update focused index to follow the dragged slot
    const draggedSlotIndex = slotOrder[sourcePosition];
    const targetSlotIndex = slotOrder[targetPosition];
    if (focusedIndex === draggedSlotIndex) {
      // The focused slot moved to a new position, update focusedIndex to the slot that's now there
      // Actually, focusedIndex refers to slot index, not position, so we don't need to change it
    }
  }, [draggedPosition, numSlots, slotOrder, focusedIndex]);

  // Global mouse up to cancel drag if released outside a slot
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (draggedPosition !== null) {
        console.log(`[GlobalMouseUp] Drag cancelled - released outside slots`);
        setDraggedPosition(null);
        setDragOverPosition(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [draggedPosition]);

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
    <div
      className="w-full h-full bg-black flex flex-col overflow-hidden"
      style={{
        height: '100%',
        minHeight: '-webkit-fill-available',
      }}
    >
      {/* URL Input Bar */}
      {!hideTopBar && (
        <div
          className="bg-zinc-900 border-b border-zinc-800 p-4"
          style={{
            paddingTop: `calc(env(safe-area-inset-top, 0px) + 1rem)`,
            paddingBottom: '1rem',
            paddingLeft: `calc(env(safe-area-inset-left, 0px) + 1rem)`,
            paddingRight: `calc(env(safe-area-inset-right, 0px) + 1rem)`,
          }}
        >
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
            numSlots={numSlots}
            onAddSlot={handleAddSlot}
            onRemoveSlot={handleRemoveSlot}
            singleVideoMode={singleVideoMode}
            onToggleSingleVideoMode={() => setSingleVideoMode(!singleVideoMode)}
            onFocusChange={setFocusedIndex}
          />
        </div>
      )}

      {/* Show/Hide Top Bar Button (when hidden) */}
      {hideTopBar && showControlsButton && (
        <button
          onClick={() => setHideTopBar(false)}
          className="absolute left-1/2 transform -translate-x-1/2 bg-zinc-900/90 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-300 z-50 flex items-center gap-2"
          style={{
            top: `calc(env(safe-area-inset-top, 0px) + 1rem)`,
          }}
          title="Show controls"
        >
          <span>⬇️</span>
          <span>Show Controls</span>
        </button>
      )}

      {/* Responsive Video Grid with adjustable borders */}
      <div
        className={`flex-1 bg-zinc-950 ${isPortrait ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{
          position: 'relative',
          // Extend to use all available vertical space, including safe areas
          minHeight: 0, // Important for flex-1 to work correctly
        }}
        onTouchStart={handleScreenTap}
        onClick={handleScreenTap}
      >
        {/* Render VideoPlayers based on numSlots and single video mode */}
        {(() => {
          // Single video mode: show only focused video fullscreen
          if (singleVideoMode) {
            const index = focusedIndex;
            if (index < videoSlots.length) {
              return (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    paddingLeft: isPortrait ? 0 : '4px',
                    paddingRight: isPortrait ? 0 : '4px',
                    paddingTop: isPortrait ? '2px' : '4px',
                    paddingBottom: isPortrait ? '2px' : '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <VideoPlayer
                    key={`video-player-${index}`}
                    url={videoSlots[index].url}
                    quadrantIndex={index}
                    isFocused={true}
                    isExpanded={false}
                    isAudioEnabled={true}
                    onFocus={() => setFocusedIndex(index)}
                    onToggleExpand={() => handleToggleExpand(index)}
                  />
                </div>
              );
            }
            return null;
          }

          // Multi-video mode: render all slots
          // Each slot always renders the same data (to prevent reloads)
          // We use slotOrder to determine CSS positioning
          const anyExpanded = videoSlots.some(s => s.isExpanded);
          const expandedIndex = videoSlots.findIndex(s => s.isExpanded);
          const slotsToRender = Array.from({ length: numSlots }, (_, i) => i);

          return slotsToRender.map((slotIndex) => {
            if (slotIndex >= videoSlots.length) return null;

            // Find which position this slot should appear in
            const position = slotOrder.findIndex(si => si === slotIndex);
            if (position === -1 || position >= numSlots) return null;

            // Calculate visual position based on current layout mode and orientation
            // Use 'position' for layout calculations (where it appears on screen)
            // Use 'slotIndex' for data access (which video slot's data to show)
            let style: React.CSSProperties;

            if (isPortrait) {
              // Portrait mode: Stack vertically - fill full width, minimal vertical padding
              const heightPercent = 100 / numSlots;
              style = {
                position: 'absolute',
                top: `${position * heightPercent}%`,
                left: 0,
                right: 0,
                height: `${heightPercent}%`,
                paddingLeft: 0,
                paddingRight: 0,
                paddingTop: '2px',
                paddingBottom: '2px',
                boxSizing: 'border-box',
              };
            } else if (layoutMode === 'split') {
              // Landscape split mode
              style = { position: 'absolute', padding: '4px', boxSizing: 'border-box' };
              // Find which position the focused slot is in
              const focusedPosition = slotOrder.findIndex(si => si === focusedIndex);
              if (slotIndex === focusedIndex) {
                // Top video (focused)
                style = { ...style, top: 0, left: 0, right: 0, height: `${splitHorizontalSplit}%` };
              } else {
                // Bottom videos - calculate position among non-focused slots
                const otherSlots = slotsToRender.filter(si => si !== focusedIndex);
                const bottomPos = otherSlots.indexOf(slotIndex);
                const widthPercent = 100 / Math.max(1, otherSlots.length);
                style = {
                  ...style,
                  top: `${splitHorizontalSplit}%`,
                  left: `${bottomPos * widthPercent}%`,
                  width: `${widthPercent}%`,
                  bottom: 0
                };
              }
            } else if (anyExpanded) {
              // Expanded mode (works in both grid and expanded layout modes)
              style = { position: 'absolute', padding: '4px', boxSizing: 'border-box' };
              if (slotIndex === expandedIndex) {
                // Left expanded video
                style = { ...style, top: 0, left: 0, width: `${expandedVerticalSplit}%`, bottom: 0 };
              } else {
                // Right stacked videos
                const otherSlots = slotsToRender.filter(si => si !== expandedIndex);
                const stackPos = otherSlots.indexOf(slotIndex);
                const heightPercent = 100 / Math.max(1, otherSlots.length);
                style = {
                  ...style,
                  top: `${stackPos * heightPercent}%`,
                  left: `${expandedVerticalSplit}%`,
                  right: 0,
                  height: `${heightPercent}%`
                };
              }
            } else {
              // Grid mode
              style = { position: 'absolute', padding: '4px', boxSizing: 'border-box' };
              // Grid mode: calculate grid dimensions based on position
              const cols = numSlots <= 2 ? numSlots : Math.ceil(Math.sqrt(numSlots));
              const rows = Math.ceil(numSlots / cols);
              const row = Math.floor(position / cols);
              const col = position % cols;

              if (numSlots === 1) {
                style = { ...style, top: 0, left: 0, right: 0, bottom: 0 };
              } else if (numSlots === 2) {
                // Two videos side by side
                style = {
                  ...style,
                  top: 0,
                  bottom: 0,
                  left: col === 0 ? 0 : `${gridVerticalSplit}%`,
                  width: col === 0 ? `${gridVerticalSplit}%` : `${100 - gridVerticalSplit}%`
                };
              } else {
                // Grid with multiple videos
                const widthPercent = 100 / cols;
                const heightPercent = 100 / rows;
                style = {
                  ...style,
                  top: `${row * heightPercent}%`,
                  left: `${col * widthPercent}%`,
                  width: `${widthPercent}%`,
                  height: `${heightPercent}%`
                };
              }
            }

            return (
              <div
                key={slotIndex}
                ref={(el) => { slotRefs.current[slotIndex] = el; }}
                style={style}
                className="relative group"
              >
                {/* Drag handle - centered at the top for consistent access */}
                <div
                  className={`absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-black/70 hover:bg-black/90 text-white p-2 rounded transition-colors select-none transition-opacity duration-200 ${draggedPosition === position ? 'cursor-grabbing opacity-100' : 'cursor-grab opacity-0 group-hover:opacity-100'
                    }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent text selection
                    e.stopPropagation();
                    handleMouseDown(position);
                  }}
                  title="Drag to swap position"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 9h4v4H3zM9.5 9h5v4h-5zM17 9h4v4h-4z" />
                  </svg>
                </div>

                {/* Drop zone overlay - only active during drag, covers the entire slot to capture mouse events */}
                {draggedPosition !== null && draggedPosition !== position && (
                  <div
                    className={`absolute inset-0 ${dragOverPosition === position ? 'bg-blue-500/30' : 'bg-black/20'
                      }`}
                    style={{ zIndex: 9999 }}
                    onMouseEnter={() => handleMouseEnter(position)}
                    onMouseLeave={() => handleMouseLeave(position)}
                    onMouseUp={(e) => {
                      e.stopPropagation();
                      handleMouseUp(position);
                    }}
                  >
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-medium pointer-events-none">
                      {dragOverPosition === position ? 'Release to swap' : 'Drop here'}
                    </div>
                  </div>
                )}

                {/* Show indicator on the slot being dragged */}
                {draggedPosition === position && (
                  <div className="absolute inset-0 bg-yellow-500/20 pointer-events-none" style={{ zIndex: 9998 }}>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      Dragging...
                    </div>
                  </div>
                )}
                <VideoPlayer
                  key={`video-player-${slotIndex}`}
                  url={videoSlots[slotIndex].url}
                  quadrantIndex={slotIndex}
                  isFocused={focusedIndex === slotIndex}
                  isExpanded={videoSlots[slotIndex].isExpanded}
                  isAudioEnabled={focusedIndex === slotIndex}
                  onFocus={() => setFocusedIndex(slotIndex)}
                  onToggleExpand={() => handleToggleExpand(slotIndex)}
                  isDraggedOver={dragOverPosition === position}
                  isDragging={draggedPosition === position}
                />
              </div>
            );
          }).filter(Boolean);
        })()}

        {/* Render splitters on top (only in landscape mode and not single video mode) */}
        {!singleVideoMode && !isPortrait && layoutMode === 'split' && numSlots > 1 && (
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

        {!singleVideoMode && !isPortrait && videoSlots.some(s => s.isExpanded) && layoutMode !== 'split' && numSlots > 1 && (
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

        {!singleVideoMode && !isPortrait && !videoSlots.some(s => s.isExpanded) && layoutMode === 'grid' && numSlots === 2 && (
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
        )}
      </div>
    </div>
  );
}

