'use client';

import React, { useState } from 'react';

interface VideoInputProps {
  onSetUrl: (quadrantIndex: number, url: string) => void;
  focusedIndex: number;
  videoSlots: { url: string; isExpanded: boolean }[];
  slotOrder: number[];
  onToggleTopBar: () => void;
  layoutMode: 'grid' | 'expanded' | 'split';
  onToggleLayout: () => void;
  onResetLayout: () => void;
  numSlots: number;
  onAddSlot: () => void;
  onRemoveSlot: () => void;
  singleVideoMode: boolean;
  onToggleSingleVideoMode: () => void;
  onFocusChange?: (index: number) => void;
}

export default function VideoInput({
  onSetUrl,
  focusedIndex,
  videoSlots,
  slotOrder,
  onToggleTopBar,
  layoutMode,
  onToggleLayout,
  onResetLayout,
  numSlots,
  onAddSlot,
  onRemoveSlot,
  singleVideoMode,
  onToggleSingleVideoMode,
  onFocusChange,
}: VideoInputProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [selectedQuadrant, setSelectedQuadrant] = useState(focusedIndex);
  const [showCopied, setShowCopied] = useState(false);

  // Update selected quadrant when focused index changes
  React.useEffect(() => {
    if (focusedIndex < numSlots) {
      setSelectedQuadrant(focusedIndex);
    }
  }, [focusedIndex, numSlots]);

  // Update input URL when selected quadrant changes
  React.useEffect(() => {
    if (selectedQuadrant < videoSlots.length) {
      const currentUrl = videoSlots[selectedQuadrant]?.url || '';
      setInputUrl(currentUrl);
    }
  }, [selectedQuadrant, videoSlots]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      onSetUrl(selectedQuadrant, inputUrl.trim());
      // Input will be updated by the useEffect to show the loaded URL
    }
  };

  const handleClear = () => {
    onSetUrl(selectedQuadrant, '');
    // Input will be cleared by the useEffect when videoSlots updates
  };

  const handleRefresh = () => {
    const currentUrl = videoSlots[selectedQuadrant]?.url;
    if (currentUrl) {
      // Temporarily clear the URL, then restore it to force a reload
      onSetUrl(selectedQuadrant, '');
      // Use setTimeout to ensure the clear happens first
      setTimeout(() => {
        onSetUrl(selectedQuadrant, currentUrl);
      }, 50);
    }
  };

  const handleShare = async () => {
    // Build video URLs object (only include slots with URLs)
    const videoUrls: { [key: string]: string } = {};
    videoSlots.forEach((slot, index) => {
      if (slot.url) {
        videoUrls[index.toString()] = slot.url;
      }
    });

    try {
      // Create short URL via backend API
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numSlots,
          slotOrder,
          videoUrls,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create share link');
      }

      const { id } = await response.json();
      const shareUrl = `${window.location.origin}/s/${id}`;

      await navigator.clipboard.writeText(shareUrl);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error('Share failed:', err);
      // Fallback: show error
      alert('Failed to create share link. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="overflow-x-auto overflow-y-hidden">
      <div className="flex items-center gap-4 min-w-max">
        {/* Hide Controls Button */}
        <button
          type="button"
          onClick={onToggleTopBar}
          className="group w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 hover:bg-zinc-700 flex-shrink-0 flex items-center justify-center"
          title="Hide controls (fullscreen)"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Fullscreen icon - expand arrows */}
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>

        {/* Layout Toggle Button */}
        <button
          type="button"
          onClick={onToggleLayout}
          className={`w-10 h-10 rounded-lg font-semibold transition-all flex-shrink-0 ${
            layoutMode === 'split'
              ? 'bg-blue-600 text-white ring-2 ring-blue-400'
              : layoutMode === 'expanded'
                ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          }`}
          title={`Layout: ${layoutMode} (click to cycle)`}
        >
          {layoutMode === 'split' ? '📐' : layoutMode === 'expanded' ? '🔍' : '⊞'}
        </button>

        {/* Reset Layout Button */}
        <button
          type="button"
          onClick={onResetLayout}
          className="w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white flex-shrink-0"
          title="Reset layout dimensions"
        >
          ↺
        </button>

        {/* Single Video Mode Toggle */}
        <button
          type="button"
          onClick={onToggleSingleVideoMode}
          className={`w-10 h-10 rounded-lg font-semibold transition-all flex-shrink-0 ${
            singleVideoMode
              ? 'bg-green-600 text-white ring-2 ring-green-400'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          }`}
          title={singleVideoMode ? 'Single video mode (click to disable)' : 'Single video mode (click to enable)'}
        >
          🎬
        </button>

        {/* Add/Remove Slot Buttons */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onAddSlot}
            disabled={numSlots >= 9}
            className="w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed flex-shrink-0"
            title="Add quadrant"
          >
            +
          </button>
          <button
            type="button"
            onClick={onRemoveSlot}
            disabled={numSlots <= 1}
            className="w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed flex-shrink-0"
            title="Remove quadrant"
          >
            −
          </button>
        </div>

        {/* Quadrant Selector */}
        <div className="flex gap-2 flex-shrink-0">
          {Array.from({ length: numSlots }, (_, i) => i).map((index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                setSelectedQuadrant(index);
                // In single video mode, immediately switch the focused video
                if (singleVideoMode && onFocusChange) {
                  onFocusChange(index);
                }
              }}
              className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                selectedQuadrant === index
                  ? 'bg-zinc-700 text-white ring-2 ring-zinc-600'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
              title={`Quadrant ${index + 1}`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* URL Input */}
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Paste video URL (YouTube, Twitch, CrackStreams, StreamEast, HLS .m3u8...)"
          className="min-w-[300px] px-4 py-2 bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-zinc-500"
        />

        {/* Action Buttons */}
        <button
          type="submit"
          disabled={!inputUrl.trim()}
          className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors flex-shrink-0 whitespace-nowrap"
        >
          Load
        </button>

        {videoSlots[selectedQuadrant]?.url && (
          <>
            <button
              type="button"
              onClick={handleClear}
              className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex-shrink-0 whitespace-nowrap"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="group w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 hover:bg-zinc-700 flex-shrink-0 flex items-center justify-center"
              title="Refresh video"
            >
              <svg
                className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </>
        )}

        {/* Share Button - iOS style share icon at the right end */}
        <button
          type="button"
          onClick={handleShare}
          className="group relative w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 hover:bg-zinc-700 flex-shrink-0 ml-auto flex items-center justify-center"
          title="Share this setup"
        >
          {showCopied ? (
            <span className="text-white text-xl">✓</span>
          ) : (
            <svg
              viewBox="0 0 50 50"
              className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors"
              fill="currentColor"
            >
              <path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z" />
              <path d="M24 7h2v21h-2z" />
              <path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}

