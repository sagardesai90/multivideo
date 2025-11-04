'use client';

import React, { useState } from 'react';

interface VideoInputProps {
  onSetUrl: (quadrantIndex: number, url: string) => void;
  focusedIndex: number;
  videoSlots: { url: string; isExpanded: boolean }[];
  onToggleTopBar: () => void;
}

export default function VideoInput({
  onSetUrl,
  focusedIndex,
  videoSlots,
  onToggleTopBar,
}: VideoInputProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [selectedQuadrant, setSelectedQuadrant] = useState(focusedIndex);

  // Update selected quadrant when focused index changes
  React.useEffect(() => {
    setSelectedQuadrant(focusedIndex);
  }, [focusedIndex]);

  // Update input URL when selected quadrant changes
  React.useEffect(() => {
    const currentUrl = videoSlots[selectedQuadrant]?.url || '';
    setInputUrl(currentUrl);
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

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-4">
      {/* Hide Controls Button */}
      <button
        type="button"
        onClick={onToggleTopBar}
        className="w-10 h-10 rounded-lg font-semibold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
        title="Hide controls (fullscreen)"
      >
        ⬆️
      </button>

      {/* Quadrant Selector */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSelectedQuadrant(index)}
            className={`w-10 h-10 rounded-lg font-semibold transition-all ${
              selectedQuadrant === index
                ? 'bg-green-600 text-white ring-2 ring-green-400'
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
        className="flex-1 px-4 py-2 bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-zinc-500"
      />

      {/* Action Buttons */}
      <button
        type="submit"
        disabled={!inputUrl.trim()}
        className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
      >
        Load
      </button>

      {videoSlots[selectedQuadrant]?.url && (
        <button
          type="button"
          onClick={handleClear}
          className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          Clear
        </button>
      )}
    </form>
  );
}

