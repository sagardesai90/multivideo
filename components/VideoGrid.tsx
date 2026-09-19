'use client';

import React, { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import VideoInput from './VideoInput';
import Splitter from './Splitter';

interface VideoSlot {
  url: string;
  isExpanded: boolean;
}

// Slot order maps visual position to slot index
// Initially identity mapping [0,1,2,3,4,5,6,7,8] - position = slot index
// When dragging, we swap video data between slots (slot numbers stay fixed)
// When deleting slots, we remove them from slotOrder without moving video data (prevents reloads)

// Helper to normalize a slotOrder array to always have 9 unique elements (0-8)
function normalizeSlotOrder(order: number[]): number[] {
  // Remove duplicates while preserving order (keep first occurrence)
  const seen = new Set<number>();
  const unique: number[] = [];

  for (const item of order) {
    if (!seen.has(item) && item >= 0 && item < 9) {
      seen.add(item);
      unique.push(item);
    }
  }

  // Find which indices 0-8 are missing
  for (let i = 0; i < 9; i++) {
    if (!seen.has(i)) {
      unique.push(i);
    }
  }

  // Ensure we have exactly 9 elements
  return unique.slice(0, 9);
}

// Helper to distribute secondary slots between side (right) and bottom to utilize black bars
function getSecondarySlotDistribution(
  mode: 'split' | 'expanded',
  totalSlots: number
): { sideSlots: number; bottomSlots: number } {
  if (totalSlots <= 1) {
    return { sideSlots: 0, bottomSlots: 0 };
  }

  if (mode === 'split') {
    switch (totalSlots) {
      case 2:
        return { sideSlots: 0, bottomSlots: 1 };
      case 3:
        return { sideSlots: 0, bottomSlots: 2 };
      case 4:
        return { sideSlots: 1, bottomSlots: 2 };
      case 5:
        return { sideSlots: 2, bottomSlots: 2 };
      case 6:
        return { sideSlots: 2, bottomSlots: 3 };
      case 7:
        return { sideSlots: 3, bottomSlots: 3 };
      case 8:
        return { sideSlots: 3, bottomSlots: 4 };
      case 9:
      default:
        return { sideSlots: 4, bottomSlots: 4 };
    }
  } else {
    // expanded mode
    switch (totalSlots) {
      case 2:
        return { sideSlots: 1, bottomSlots: 0 };
      case 3:
        return { sideSlots: 2, bottomSlots: 0 };
      case 4:
        return { sideSlots: 2, bottomSlots: 1 };
      case 5:
        return { sideSlots: 2, bottomSlots: 2 };
      case 6:
        return { sideSlots: 3, bottomSlots: 2 };
      case 7:
        return { sideSlots: 3, bottomSlots: 3 };
      case 8:
        return { sideSlots: 4, bottomSlots: 3 };
      case 9:
      default:
        return { sideSlots: 4, bottomSlots: 4 };
    }
  }
}

export default function VideoGrid() {
  // Always maintain 9 slots - numSlots controls visibility, not array length
  // This ensures we never lose data when changing grid size
  const [videoSlots, setVideoSlots] = useState<VideoSlot[]>(
    Array.from({ length: 9 }, () => ({ url: '', isExpanded: false }))
  );
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [audioFocusIndex, setAudioFocusIndex] = useState<number>(0);
  const [hideTopBar, setHideTopBar] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [showControlsButton, setShowControlsButton] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'expanded' | 'split'>('grid');
  const [singleVideoMode, setSingleVideoMode] = useState<boolean>(false);
  const [numSlots, setNumSlots] = useState<number>(4);
  const [focusSlotTrigger, setFocusSlotTrigger] = useState<{
    slotIndex: number;
    timestamp: number;
  } | null>(null);
  const urlInputRef = React.useRef<HTMLInputElement>(null);
  const inactivityTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Slot order - maps visual position to slot index
  // Initially identity mapping [0,1,2,3,4,5,6,7,8] - position = slot index
  // When slots are deleted, we remove them from slotOrder without moving video data
  // This prevents videos from reloading - they stay in their original slots
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
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Load from localStorage and URL params on mount
  // Load from localStorage and URL params on mount
  useEffect(() => {
    // Check URL parameters first (for shared links) - URL takes precedence over localStorage
    const urlParams = new URLSearchParams(window.location.search);

    // Check for numSlots in URL params (support both 'n' and legacy 'numSlots')
    const urlNumSlots = urlParams.get('n') || urlParams.get('numSlots');
    let targetNumSlots = 4; // default

    // If URL has numSlots, use it (takes precedence)
    if (urlNumSlots) {
      const parsed = parseInt(urlNumSlots, 10);
      if (parsed >= 1 && parsed <= 9) {
        targetNumSlots = parsed;
        setNumSlots(parsed);
      }
    } else {
      // Only load from localStorage if no URL param
      const savedNumSlots = localStorage.getItem('numSlots');
      if (savedNumSlots) {
        try {
          const parsed = parseInt(savedNumSlots, 10);
          if (parsed >= 1 && parsed <= 9) {
            targetNumSlots = parsed;
            setNumSlots(parsed);
          }
        } catch (e) {
          console.error('Failed to load saved numSlots:', e);
        }
      }
    }

    const savedSingleVideoMode = localStorage.getItem('singleVideoMode');
    if (savedSingleVideoMode === 'true') {
      setSingleVideoMode(true);
    }

    // Always create full 9-slot array to preserve data
    const urlVideos: VideoSlot[] = Array.from({ length: 9 }, () => ({ url: '', isExpanded: false }));

    let hasUrlVideos = false;
    // Check all possible slots (0-8) for URL parameters
    // Support both new format (just index: '0', '1') and legacy format ('v0', 'v1')
    for (let i = 0; i < 9; i++) {
      const urlParam = urlParams.get(i.toString()) || urlParams.get(`v${i}`);
      if (urlParam) {
        urlVideos[i].url = urlParam;
        hasUrlVideos = true;
        // If we find a video at index i, ensure numSlots is at least i+1
        if (i + 1 > targetNumSlots) {
          targetNumSlots = i + 1;
          setNumSlots(i + 1);
        }
      }
    }

    // Load slotOrder from URL if present (preserves rearrangements)
    // Support both new compact format ('o'="312045678") and legacy JSON format ('slotOrder')
    const urlSlotOrderCompact = urlParams.get('o');
    const urlSlotOrderLegacy = urlParams.get('slotOrder');

    if (urlSlotOrderCompact) {
      // New compact format: "312045678" - each char is a digit 0-8
      const parsed = urlSlotOrderCompact.split('').map(c => parseInt(c, 10));
      if (parsed.length >= 1 && parsed.every(n => !isNaN(n) && n >= 0 && n <= 8)) {
        const normalized = normalizeSlotOrder(parsed);
        setSlotOrder(normalized);
      }
    } else if (urlSlotOrderLegacy) {
      // Legacy JSON format: "[3,1,2,0,4,5,6,7,8]"
      try {
        const parsed = JSON.parse(urlSlotOrderLegacy);
        if (Array.isArray(parsed) && parsed.length >= 1) {
          const normalized = normalizeSlotOrder(parsed);
          setSlotOrder(normalized);
        }
      } catch (e) {
        console.error('Failed to parse slotOrder from URL:', e);
      }
    } else {
      // Only load from localStorage if no URL params for slotOrder
      const savedSlotOrder = localStorage.getItem('slotOrder');
      if (savedSlotOrder) {
        try {
          const parsed = JSON.parse(savedSlotOrder);
          if (Array.isArray(parsed) && parsed.length >= 1) {
            // Normalize to 9 elements, filling missing indices
            const normalized = normalizeSlotOrder(parsed);
            setSlotOrder(normalized);
          }
        } catch (e) {
          console.error('Failed to load saved slot order:', e);
        }
      }
    }

    if (hasUrlVideos) {
      // Use URL params - always set full 9-slot array
      setVideoSlots(urlVideos);
    } else {
      // Fall back to localStorage
      const saved = localStorage.getItem('videoSlots');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Ensure we always have 9 slots
          if (Array.isArray(parsed)) {
            const fullSlots: VideoSlot[] = Array.from({ length: 9 }, (_, i) =>
              parsed[i] || { url: '', isExpanded: false }
            );
            setVideoSlots(fullSlots);
          }
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

    // Mark as loaded so we can start saving
    setIsLoaded(true);
  }, []);

  // Sync state to URL
  useEffect(() => {
    if (!isLoaded) return;

    const params = new URLSearchParams();

    // Set numSlots
    params.set('n', numSlots.toString());

    // Set slotOrder (compact format)
    const orderStr = slotOrder.slice(0, 9).join('');
    params.set('o', orderStr);

    // Set video URLs
    videoSlots.forEach((slot, index) => {
      if (slot.url) {
        params.set(index.toString(), slot.url);
      }
    });

    // Update URL without reloading or adding to history
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);

  }, [numSlots, slotOrder, videoSlots, isLoaded]);

  // Save to localStorage whenever videoSlots changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('videoSlots', JSON.stringify(videoSlots));
    }
  }, [videoSlots, isLoaded]);

  // Save slot order to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('slotOrder', JSON.stringify(slotOrder));
    }
  }, [slotOrder, isLoaded]);

  // Validate and normalize slotOrder to ensure it's always valid
  // This prevents issues where slotOrder might have duplicates or missing slots
  // Use a ref to track the last validated slotOrder to prevent infinite loops
  const lastValidatedSlotOrderRef = React.useRef<string>('');

  useEffect(() => {
    if (!isLoaded) return;

    // Create a string representation to compare (avoids reference equality issues)
    const slotOrderKey = JSON.stringify(slotOrder);

    // Skip if we already validated this exact slotOrder
    if (lastValidatedSlotOrderRef.current === slotOrderKey) {
      return;
    }

    // Check if slotOrder is valid (has 9 elements, all unique, all 0-8)
    const hasCorrectLength = slotOrder.length === 9;
    const hasUniqueValues = new Set(slotOrder).size === 9;
    const hasValidIndices = slotOrder.every(idx => idx >= 0 && idx < 9);

    // Also check if the visible range (first numSlots) has duplicates - this is critical!
    const visibleRange = slotOrder.slice(0, numSlots);
    const hasUniqueVisibleValues = new Set(visibleRange).size === visibleRange.length;

    if (!hasCorrectLength || !hasUniqueValues || !hasValidIndices || !hasUniqueVisibleValues) {
      console.warn('slotOrder is invalid, normalizing:', {
        slotOrder,
        length: slotOrder.length,
        uniqueCount: new Set(slotOrder).size,
        hasValidIndices,
        visibleRange,
        visibleUniqueCount: new Set(visibleRange).size,
        numSlots,
        duplicates: visibleRange.filter((val, idx) => visibleRange.indexOf(val) !== idx)
      });
      const normalized = normalizeSlotOrder(slotOrder);

      // Always update if invalid - don't check if different, just fix it immediately
      const normalizedKey = JSON.stringify(normalized);
      lastValidatedSlotOrderRef.current = normalizedKey;
      setSlotOrder(normalized);
      return;
    }

    // Mark this slotOrder as validated
    lastValidatedSlotOrderRef.current = slotOrderKey;
  }, [slotOrder, isLoaded, numSlots]);

  // Note: slotOrder is now loaded in the main mount effect above (lines 121-144)
  // This consolidates URL and localStorage loading to avoid race conditions

  // Save number of slots and single video mode
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('numSlots', numSlots.toString());
    }
  }, [numSlots, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('singleVideoMode', singleVideoMode.toString());
    }
  }, [singleVideoMode, isLoaded]);

  // When numSlots changes, ensure focusedIndex is valid
  // Note: slotOrder always has 9 elements, we don't need to sync it with numSlots
  useEffect(() => {
    // Ensure focusedIndex is valid for the visible slots
    if (focusedIndex >= numSlots) {
      setFocusedIndex(Math.max(0, numSlots - 1));
    }
  }, [numSlots, focusedIndex]);

  const handleAddSlot = () => {
    if (numSlots < 9) {
      const newNumSlots = numSlots + 1;
      setNumSlots(newNumSlots);

      // Ensure slotOrder has enough visible slots
      // If we're adding a slot, make sure slotOrder includes slots 0 through newNumSlots-1
      setSlotOrder((order) => {
        const visibleSlots = order.slice(0, numSlots);
        const hiddenSlots = order.slice(numSlots);

        // Check if we need to add the next slot to visible positions
        // Find which slot index should be at position numSlots
        const allSlots = new Set(order);
        let nextSlotIndex = -1;

        // Find the first slot index (0-8) that's not in the visible positions
        for (let i = 0; i < 9; i++) {
          if (!visibleSlots.includes(i)) {
            nextSlotIndex = i;
            break;
          }
        }

        // If we found a slot to add, insert it; otherwise use the next sequential index
        if (nextSlotIndex === -1) {
          nextSlotIndex = numSlots; // Use sequential index if all are already visible
        }

        // Create new order with the added slot
        const newOrder = [...visibleSlots, nextSlotIndex, ...hiddenSlots.filter(s => s !== nextSlotIndex)];

        // Ensure we have exactly 9 elements
        while (newOrder.length < 9) {
          // Find missing slot indices
          const present = new Set(newOrder);
          for (let i = 0; i < 9; i++) {
            if (!present.has(i)) {
              newOrder.push(i);
              break;
            }
          }
        }

        return newOrder.slice(0, 9);
      });
    }
  };

  const handleRemoveSlot = () => {
    if (numSlots > 1) {
      const newNumSlots = numSlots - 1;
      // Get the slot index at the last visible position
      const slotIndexToRemove = slotOrder[newNumSlots];

      // Clear the slot data for the removed slot (but keep it in its original position)
      // This prevents videos from reloading - they stay in their original slots
      setVideoSlots((slots) =>
        slots.map((slot, i) =>
          i === slotIndexToRemove ? { ...slot, url: '' } : slot
        )
      );

      // Remove the slot from slotOrder without reordering video data
      // This prevents videos from reloading - they stay in their original slots
      setSlotOrder((order) => {
        const newOrder = [...order];
        // Remove the slot at position newNumSlots
        newOrder.splice(newNumSlots, 1);
        // Append it to the end to maintain 9 elements
        newOrder.push(slotIndexToRemove);
        return newOrder;
      });

      // Update numSlots state (this will trigger localStorage save for numSlots)
      setNumSlots(newNumSlots);
      // focusedIndex adjustment is handled by the numSlots effect
      // videoSlots update will trigger localStorage save via useEffect
    }
  };

  const handleRemoveAnySlot = (slotIndex: number) => {
    // Validate slot index
    if (slotIndex < 0 || slotIndex >= 9) {
      return;
    }

    // If slot has a URL, just clear it (don't remove the slot from the grid)
    if (videoSlots[slotIndex]?.url) {
      handleSetUrl(slotIndex, '');
      // Adjust focusedIndex if it's now out of bounds
      if (focusedIndex >= numSlots) {
        setFocusedIndex(Math.max(0, numSlots - 1));
      }
    }
  };

  // Save split positions to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('splitPositions', JSON.stringify({
        gridVerticalSplit,
        gridHorizontalSplit,
        expandedVerticalSplit,
        splitHorizontalSplit,
      }));
    }
  }, [gridVerticalSplit, gridHorizontalSplit, expandedVerticalSplit, splitHorizontalSplit, isLoaded]);

  // Handle ESC key to exit expand mode and intercept Cmd+W if dispatched
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVideoSlots((slots) =>
          slots.map((slot) => ({ ...slot, isExpanded: false }))
        );
      }
      // In environments where browser passes Cmd+W to the document
      if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Prevent accidental tab closure (Cmd+W, closing tab, or reload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Setting a non-empty string is required by Chromium/Blink and WebKit to trigger the confirmation dialog
      const message = 'Are you sure you want to leave this page?';
      e.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.onbeforeunload = handleBeforeUnload;

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.onbeforeunload = null;
    };
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
    // Only update the specific slot to minimize re-renders
    // Use functional update to ensure we're working with the latest state
    setVideoSlots((slots) => {
      // Only create a new array if the URL actually changed
      const currentSlot = slots[quadrantIndex];
      if (currentSlot.url === url) {
        return slots; // No change, return same array reference
      }

      // Create new array with only the changed slot updated
      const newSlots = [...slots];
      newSlots[quadrantIndex] = { ...currentSlot, url };
      return newSlots;
    });

    const anyExpanded = videoSlots.some((s) => s.isExpanded);
    const isMainVideoLayout = layoutMode === 'expanded' || layoutMode === 'split' || anyExpanded;

    // In expanded or split mode (or if any video is expanded), do NOT change focusedIndex
    // so secondary slots don't swap into the main/featured video position when loading a link or deleting.
    if (!isMainVideoLayout) {
      setFocusedIndex((current) => current !== quadrantIndex ? quadrantIndex : current);
    }

    if (url) {
      // In main video layouts, keep audio on the main video if it has a stream
      if (!isMainVideoLayout || !videoSlots[focusedIndex]?.url || focusedIndex === quadrantIndex) {
        setAudioFocusIndex((current) => current !== quadrantIndex ? quadrantIndex : current);
      }
    }
  };

  const handleFocusSlot = React.useCallback((slotIndex: number) => {
    const anyExpanded = videoSlots.some((s) => s.isExpanded);
    const isMainVideoLayout = layoutMode === 'expanded' || layoutMode === 'split' || anyExpanded;

    // In expanded or split mode, focusing an empty slot should NOT move it into the main video position
    if (isMainVideoLayout && !videoSlots[slotIndex]?.url) {
      return;
    }

    setFocusedIndex(slotIndex);
    if (videoSlots[slotIndex]?.url) {
      setAudioFocusIndex(slotIndex);
    }
  }, [videoSlots, layoutMode]);

  const handleEmptySlotClick = React.useCallback((slotIndex: number) => {
    const anyExpanded = videoSlots.some((s) => s.isExpanded);
    const isMainVideoLayout = layoutMode === 'expanded' || layoutMode === 'split' || anyExpanded;

    if (!isMainVideoLayout) {
      handleFocusSlot(slotIndex);
    }
    setHideTopBar(false);
    setFocusSlotTrigger({ slotIndex, timestamp: Date.now() });
    urlInputRef.current?.focus();
  }, [handleFocusSlot, layoutMode, videoSlots]);

  useEffect(() => {
    if (!videoSlots.length) return;
    const currentHasUrl = Boolean(videoSlots[audioFocusIndex]?.url);
    if (currentHasUrl) {
      return;
    }

    const firstWithUrl = videoSlots.findIndex((slot) => Boolean(slot.url));
    const fallbackIndex = firstWithUrl !== -1 ? firstWithUrl : 0;

    if (fallbackIndex !== audioFocusIndex) {
      setAudioFocusIndex(fallbackIndex);
    }
  }, [videoSlots, audioFocusIndex]);

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

    const sourceSlot = slotOrder[sourcePosition];
    const targetSlot = slotOrder[targetPosition];

    // Swap slotOrder to swap which slots appear in which positions
    // This keeps slot numbers fixed (position-based) and prevents video reloads
    // because videos stay in their original slots, just move visually
    // Note: We don't normalize here because a swap doesn't create duplicates,
    // and normalization could cause unnecessary remounts
    setSlotOrder((order) => {
      const newOrder = [...order];
      const temp = newOrder[sourcePosition];
      newOrder[sourcePosition] = newOrder[targetPosition];
      newOrder[targetPosition] = temp;
      console.log(`[Swap] Swapped slotOrder: position ${sourcePosition} <-> position ${targetPosition}`);
      console.log(`[Swap] New order: ${newOrder.slice(0, numSlots).join(', ')}`);
      return newOrder;
    });

    const anyExpanded = videoSlots.some((s) => s.isExpanded);
    const expandedIndex = videoSlots.findIndex((s) => s.isExpanded);

    if (layoutMode === 'split') {
      // In split mode, the featured video is determined by focusedIndex
      if (sourceSlot === focusedIndex) {
        setFocusedIndex(targetSlot);
        if (videoSlots[targetSlot]?.url) {
          setAudioFocusIndex(targetSlot);
        }
      } else if (targetSlot === focusedIndex) {
        setFocusedIndex(sourceSlot);
        if (videoSlots[sourceSlot]?.url) {
          setAudioFocusIndex(sourceSlot);
        }
      }
    } else if (layoutMode === 'expanded' || anyExpanded) {
      // In expanded mode (or if a video is expanded in grid mode),
      // the featured video is determined by expandedIndex
      const isSourceFeatured = sourceSlot === expandedIndex || (layoutMode === 'expanded' && sourceSlot === focusedIndex);
      const isTargetFeatured = targetSlot === expandedIndex || (layoutMode === 'expanded' && targetSlot === focusedIndex);

      if (isSourceFeatured) {
        setVideoSlots((slots) =>
          slots.map((slot, i) => ({
            ...slot,
            isExpanded: i === targetSlot,
          }))
        );
        setFocusedIndex(targetSlot);
        if (videoSlots[targetSlot]?.url) {
          setAudioFocusIndex(targetSlot);
        }
      } else if (isTargetFeatured) {
        setVideoSlots((slots) =>
          slots.map((slot, i) => ({
            ...slot,
            isExpanded: i === sourceSlot,
          }))
        );
        setFocusedIndex(sourceSlot);
        if (videoSlots[sourceSlot]?.url) {
          setAudioFocusIndex(sourceSlot);
        }
      }
    }
  }, [draggedPosition, numSlots, focusedIndex, slotOrder, layoutMode, videoSlots]);

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
      if (videoSlots[quadrantIndex]?.url) {
        setAudioFocusIndex(quadrantIndex);
      }
      return;
    }

    // In expanded mode, clicking always expands the clicked video
    if (layoutMode === 'expanded') {
      setFocusedIndex(quadrantIndex);
      if (videoSlots[quadrantIndex]?.url) {
        setAudioFocusIndex(quadrantIndex);
      }
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
        width: '100%',
        minHeight: '-webkit-fill-available',
        margin: 0,
        padding: 0,
        position: 'relative',
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
            inputRef={urlInputRef}
            focusSlotTrigger={focusSlotTrigger}
            onSetUrl={handleSetUrl}
            focusedIndex={focusedIndex}
            videoSlots={videoSlots}
            slotOrder={slotOrder}
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
            onFocusChange={handleFocusSlot}
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
          width: '100%',
          margin: 0,
          padding: 0,
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
              // Find the position of the focused slot in slotOrder
              const position = slotOrder.findIndex(si => si === index);
              const displayPosition = position !== -1 ? position : 0;

              return (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <VideoPlayer
                    key={`video-player-${index}`}
                    url={videoSlots[index].url}
                    quadrantIndex={index}
                    position={displayPosition}
                    isFocused={true}
                    isExpanded={false}
                    isAudioEnabled={audioFocusIndex === index && Boolean(videoSlots[index].url)}
                    onFocus={() => handleFocusSlot(index)}
                    onToggleExpand={() => handleToggleExpand(index)}
                    onRemove={() => handleRemoveAnySlot(index)}
                    onEmptySlotClick={() => handleEmptySlotClick(index)}
                  />
                </div>
              );
            }
            return null;
          }

          // Multi-video mode: render all slots
          // Render all 9 slots to maintain React key stability - this prevents remounts during drag and drop
          // We use slotOrder to determine which slots are visible and their CSS positioning
          const anyExpanded = videoSlots.some(s => s.isExpanded);
          const expandedIndex = videoSlots.findIndex(s => s.isExpanded);

          // Render all 9 slots to keep React keys stable - this prevents remounts during drag and drop
          // We use slotOrder to determine which slots are visible and their CSS positioning
          return Array.from({ length: 9 }, (_, slotIndex) => {
            // Find which position this slot is in (if visible)
            const position = slotOrder.findIndex(si => si === slotIndex);
            const isVisible = position !== -1 && position < numSlots;

            if (!isVisible) {
              // Slot is not visible - render hidden to maintain React key stability
              return (
                <div
                  key={slotIndex}
                  style={{ display: 'none' }}
                />
              );
            }

            // Calculate visual position based on current layout mode and orientation
            // Position is used for both layout and data access (slot numbers stay fixed)
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
                padding: 0,
                boxSizing: 'border-box',
              };
            } else if (layoutMode === 'split') {
              // Landscape split mode with dynamic slot distribution to fill black bars
              style = { position: 'absolute', padding: '0.5px', boxSizing: 'border-box' };
              const { sideSlots, bottomSlots } = getSecondarySlotDistribution('split', numSlots);

              if (slotIndex === focusedIndex) {
                // Featured video (top / top-left)
                if (sideSlots === 0) {
                  style = { ...style, top: 0, left: 0, right: 0, height: `${splitHorizontalSplit}%` };
                } else {
                  style = { ...style, top: 0, left: 0, width: `${expandedVerticalSplit}%`, height: `${splitHorizontalSplit}%` };
                }
              } else {
                // Secondary videos distributed between side column and bottom row
                const secondaryPositions = Array.from({ length: numSlots }, (_, i) => i)
                  .filter(p => slotOrder[p] !== focusedIndex);
                const secIndex = secondaryPositions.indexOf(position);

                if (secIndex < sideSlots) {
                  // Side video in the top right (stacked vertically beside featured video)
                  const sideIndex = secIndex;
                  const heightPercent = splitHorizontalSplit / Math.max(1, sideSlots);
                  style = {
                    ...style,
                    top: `${sideIndex * heightPercent}%`,
                    height: `${heightPercent}%`,
                    left: `${expandedVerticalSplit}%`,
                    right: 0,
                  };
                } else {
                  // Bottom video (spanning full width across the bottom)
                  const bottomIndex = secIndex - sideSlots;
                  const widthPercent = 100 / Math.max(1, bottomSlots);
                  style = {
                    ...style,
                    top: `${splitHorizontalSplit}%`,
                    bottom: 0,
                    left: `${bottomIndex * widthPercent}%`,
                    width: `${widthPercent}%`,
                  };
                }
              }
            } else if (anyExpanded) {
              // Expanded mode (works in both grid and expanded layout modes) with dynamic slot distribution
              style = { position: 'absolute', padding: '0.5px', boxSizing: 'border-box' };
              const { sideSlots, bottomSlots } = getSecondarySlotDistribution('expanded', numSlots);

              if (slotIndex === expandedIndex) {
                // Featured video (left / top-left)
                if (bottomSlots === 0) {
                  style = { ...style, top: 0, left: 0, width: `${expandedVerticalSplit}%`, bottom: 0 };
                } else {
                  style = { ...style, top: 0, left: 0, width: `${expandedVerticalSplit}%`, height: `${splitHorizontalSplit}%` };
                }
              } else {
                // Secondary videos distributed between side column and bottom row
                const secondaryPositions = Array.from({ length: numSlots }, (_, i) => i)
                  .filter(p => slotOrder[p] !== expandedIndex);
                const secIndex = secondaryPositions.indexOf(position);

                if (secIndex < sideSlots) {
                  // Side video in the right column (full height 0..100%)
                  const sideIndex = secIndex;
                  const heightPercent = 100 / Math.max(1, sideSlots);
                  style = {
                    ...style,
                    top: `${sideIndex * heightPercent}%`,
                    height: `${heightPercent}%`,
                    left: `${expandedVerticalSplit}%`,
                    right: 0,
                  };
                } else {
                  // Bottom video under the featured video (width 0..expandedVerticalSplit%)
                  const bottomIndex = secIndex - sideSlots;
                  const widthPercent = expandedVerticalSplit / Math.max(1, bottomSlots);
                  style = {
                    ...style,
                    top: `${splitHorizontalSplit}%`,
                    bottom: 0,
                    left: `${bottomIndex * widthPercent}%`,
                    width: `${widthPercent}%`,
                  };
                }
              }
            } else {
              // Grid mode
              style = { position: 'absolute', padding: '0.5px', boxSizing: 'border-box' };
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
                  title="Drag to swap videos"
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
                  position={position}
                  isFocused={focusedIndex === slotIndex}
                  isExpanded={videoSlots[slotIndex].isExpanded}
                  isAudioEnabled={audioFocusIndex === slotIndex && Boolean(videoSlots[slotIndex].url)}
                  onFocus={() => handleFocusSlot(slotIndex)}
                  onToggleExpand={() => handleToggleExpand(slotIndex)}
                  onRemove={() => handleRemoveAnySlot(slotIndex)}
                  isDraggedOver={dragOverPosition === position}
                  isDragging={draggedPosition === position}
                  onEmptySlotClick={() => handleEmptySlotClick(slotIndex)}
                />
              </div>
            );
          });
        })()}

        {/* Render splitters on top (only in landscape mode and not single video mode) */}
        {!singleVideoMode && !isPortrait && layoutMode === 'split' && numSlots > 1 && (
          <>
            {/* Horizontal splitter dividing top section from bottom row */}
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
            {/* Vertical splitter dividing featured video from side column (when side slots exist) */}
            {getSecondarySlotDistribution('split', numSlots).sideSlots > 0 && (
              <div style={{ position: 'absolute', top: 0, height: `${splitHorizontalSplit}%`, left: `${expandedVerticalSplit}%`, transform: 'translateX(-50%)', zIndex: 1000 }}>
                <Splitter
                  direction="vertical"
                  onDrag={(delta) => {
                    const container = document.querySelector('.flex-1') as HTMLElement;
                    if (!container) return;
                    const containerWidth = container.clientWidth;
                    const deltaPercent = (delta / containerWidth) * 100;
                    setExpandedVerticalSplit(Math.max(30, Math.min(85, expandedVerticalSplit + deltaPercent)));
                  }}
                />
              </div>
            )}
          </>
        )}

        {!singleVideoMode && !isPortrait && videoSlots.some(s => s.isExpanded) && layoutMode !== 'split' && numSlots > 1 && (
          <>
            {/* Vertical splitter dividing left section from right column */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${expandedVerticalSplit}%`, transform: 'translateX(-50%)', zIndex: 1000 }}>
              <Splitter
                direction="vertical"
                onDrag={(delta) => {
                  const container = document.querySelector('.flex-1') as HTMLElement;
                  if (!container) return;
                  const containerWidth = container.clientWidth;
                  const deltaPercent = (delta / containerWidth) * 100;
                  setExpandedVerticalSplit(Math.max(30, Math.min(85, expandedVerticalSplit + deltaPercent)));
                }}
              />
            </div>
            {/* Horizontal splitter dividing featured video from bottom row (when bottom slots exist) */}
            {getSecondarySlotDistribution('expanded', numSlots).bottomSlots > 0 && (
              <div style={{ position: 'absolute', top: `${splitHorizontalSplit}%`, left: 0, width: `${expandedVerticalSplit}%`, transform: 'translateY(-50%)', zIndex: 1000 }}>
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
          </>
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

