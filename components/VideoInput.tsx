'use client';

import React, { useState } from 'react';

interface VideoInputProps {
  onSetUrl: (quadrantIndex: number, url: string) => void;
  focusedIndex: number;
  videoSlots: { url: string; isExpanded: boolean }[];
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

  const handleShare = async () => {
    // Create URL with video links encoded
    const params = new URLSearchParams();
    videoSlots.forEach((slot, index) => {
      if (slot.url) {
        params.set(`v${index}`, slot.url);
      }
    });
    
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      // Fallback: show the URL in a prompt
      prompt('Copy this link to share:', shareUrl);
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
            {/* Ghost body */}
            <path d="M12 2C8.5 2 6 4.5 6 8v8c0 1.5-1 2-1 2s-1 .5-1 2h16c0-1.5-1-2-1-2s-1-.5-1-2V8c0-3.5-2.5-6-6-6z" />
            {/* Ghost bottom wavy edge */}
            <path d="M6 18c0 0 1 2 2 2s2-2 2-2 1 2 2 2 2-2 2-2 1 2 2 2 2-2 2-2" />
            {/* Eyes */}
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
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
            disabled={numSlots >= 8}
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
          <button
            type="button"
            onClick={handleClear}
            className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            Clear
          </button>
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

