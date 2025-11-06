'use client';

import React, { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import VideoInput from './VideoInput';

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
  const inactivityTimerRef = React.useRef<NodeJS.Timeout | null>(null);

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

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('videoSlots');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setVideoSlots(parsed);
      } catch (e) {
        console.error('Failed to load saved video slots:', e);
      }
    }
  }, []);

  // Save to localStorage whenever videoSlots changes
  useEffect(() => {
    localStorage.setItem('videoSlots', JSON.stringify(videoSlots));
  }, [videoSlots]);

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

      {/* Responsive Video Grid - Always render all 4 videos, just resize with CSS */}
      <div 
        className={`flex-1 gap-1 bg-zinc-950 p-1 ${isPortrait ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{
          display: 'grid',
          // Use orientation state for responsive layout
          gridTemplateColumns: videoSlots.some(slot => slot.isExpanded) 
            ? '3fr 1fr' 
            : isPortrait 
              ? '1fr' 
              : '1fr 1fr',
          gridTemplateRows: videoSlots.some(slot => slot.isExpanded) 
            ? '1fr 1fr 1fr' 
            : isPortrait 
              ? 'auto auto auto auto' 
              : '1fr 1fr',
          gridAutoRows: isPortrait ? 'minmax(250px, auto)' : undefined,
        }}
      >
        {videoSlots.map((slot, index) => {
          const anyExpanded = videoSlots.some(s => s.isExpanded);
          const isThisExpanded = slot.isExpanded;
          const expandedIndex = videoSlots.findIndex(s => s.isExpanded);
          
          // Determine grid positioning
          let gridStyle: React.CSSProperties = {};
          
          if (anyExpanded) {
            if (isThisExpanded) {
              // Expanded video spans all 3 rows in first column
              gridStyle = {
                gridColumn: '1',
                gridRow: '1 / 4',
              };
            } else {
              // Non-expanded videos stack in second column
              // Calculate which slot in the stack (0, 1, or 2)
              const stackPosition = index > expandedIndex 
                ? index - 1 
                : index < expandedIndex 
                ? index 
                : index;
              
              gridStyle = {
                gridColumn: '2',
                gridRow: `${stackPosition + 1}`,
              };
            }
          } else {
            // Normal grid - responsive to orientation
            if (isPortrait) {
              // Portrait: 4x1 layout (single column, 4 rows)
              gridStyle = {
                gridColumn: '1',
                gridRow: `${index + 1}`,
              };
            } else {
              // Landscape: 2x2 layout
              gridStyle = {
                gridColumn: (index % 2) + 1,
                gridRow: Math.floor(index / 2) + 1,
              };
            }
          }
          
          return (
            <div 
              key={index} 
              className="relative overflow-hidden transition-all duration-300"
              style={gridStyle}
            >
              <VideoPlayer
                url={slot.url}
                quadrantIndex={index}
                isFocused={focusedIndex === index}
                isExpanded={slot.isExpanded}
                onFocus={() => setFocusedIndex(index)}
                onToggleExpand={() => handleToggleExpand(index)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

