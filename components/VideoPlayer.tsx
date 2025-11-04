'use client';

import React, { useState, useEffect, useRef } from 'react';

interface VideoPlayerProps {
  url: string;
  quadrantIndex: number;
  isFocused: boolean;
  isExpanded: boolean;
  onFocus: () => void;
  onToggleExpand: () => void;
}

function detectVideoType(url: string): string {
  if (!url) return 'none';
  
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
  if (lowerUrl.includes('twitch.tv')) return 'twitch';
  if (lowerUrl.includes('netflix.com')) return 'netflix';
  
  // Check for HLS streams
  if (lowerUrl.endsWith('.m3u8') || lowerUrl.includes('.m3u8?')) return 'hls';
  
  // Check for direct video files
  if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return 'video';
  
  // Detect streaming sites (check before generic)
  if (lowerUrl.includes('crackstreams') || 
      lowerUrl.includes('streameast') || 
      lowerUrl.includes('methstreams') ||
      lowerUrl.includes('stream2watch') ||
      lowerUrl.includes('strikeout') ||
      lowerUrl.includes('sportsurge') ||
      lowerUrl.includes('buffstreams') ||
      lowerUrl.includes('nbastreams') ||
      lowerUrl.includes('nflbite')) {
    return 'streaming-site';
  }
  
  return 'generic';
}

function getYouTubeEmbedUrl(url: string): string {
  // Handle youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }
  
  // Handle youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }
  
  // Handle youtube.com/embed/VIDEO_ID (already embed URL)
  if (url.includes('/embed/')) {
    return url;
  }
  
  return url;
}

function getTwitchEmbedUrl(url: string): string {
  // Handle twitch.tv/channelname
  const channelMatch = url.match(/twitch\.tv\/([^/?]+)/);
  if (channelMatch && !url.includes('/videos/')) {
    return `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${window.location.hostname}`;
  }
  
  // Handle twitch.tv/videos/VIDEO_ID
  const videoMatch = url.match(/videos\/(\d+)/);
  if (videoMatch) {
    return `https://player.twitch.tv/?video=${videoMatch[1]}&parent=${window.location.hostname}`;
  }
  
  return url;
}

export default function VideoPlayer({
  url,
  quadrantIndex,
  isFocused,
  isExpanded,
  onFocus,
  onToggleExpand,
}: VideoPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoType = detectVideoType(url);
  
  // Get proxy URL
  const getProxyUrl = (targetUrl: string) => {
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  };
  
  // Reset state when URL changes
  React.useEffect(() => {
    setIframeBlocked(false);
    setUseProxy(false);
  }, [url, videoType, quadrantIndex]);

  // Check if iframe is blocked by X-Frame-Options
  useEffect(() => {
    if ((videoType === 'streaming-site' || videoType === 'generic') && url) {
      // Wait a bit for iframe to load
      const timer = setTimeout(() => {
        try {
          if (iframeRef.current) {
            // Try to access iframe content - will throw if blocked
            const iframeDoc = iframeRef.current.contentDocument;
            if (!iframeDoc || !iframeDoc.body || iframeDoc.body.innerHTML === '') {
              setIframeBlocked(true);
            }
          }
        } catch (e) {
          // X-Frame-Options blocked the iframe
          setIframeBlocked(true);
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [url, videoType, quadrantIndex]);

  // Get embed URL based on video type
  const getEmbedUrl = () => {
    switch (videoType) {
      case 'youtube':
        return getYouTubeEmbedUrl(url);
      case 'twitch':
        return getTwitchEmbedUrl(url);
      default:
        return url;
    }
  };

  const embedUrl = url ? getEmbedUrl() : '';

  // HLS Stream Support
  useEffect(() => {
    const loadHLS = async () => {
      if (videoType === 'hls' && videoRef.current && url) {
        // Check if browser natively supports HLS (Safari)
        if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = url;
        } else {
          // Use hls.js for other browsers
          try {
            const Hls = (await import('hls.js')).default;
            
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
              });
              
              hls.loadSource(url);
              hls.attachMedia(videoRef.current);
              
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // HLS stream loaded successfully
              });
              
              hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                  // Determine error type
                  let errorMsg = 'Failed to load HLS stream.';
                  if (data.type === 'networkError') {
                    errorMsg = 'Network error: Stream blocked by CORS policy. The streaming site prevents cross-origin access.';
                  } else if (data.type === 'mediaError') {
                    errorMsg = 'Media error: Unable to decode the stream.';
                  } else if (data.details === 'manifestLoadError') {
                    errorMsg = 'CORS blocked: Stream cannot be accessed from this origin. Try using a browser extension to bypass CORS.';
                  }
                  
                  setError(errorMsg);
                  hls.destroy();
                }
              });
              
              hlsRef.current = hls;
            } else {
              setError('HLS streaming not supported in this browser');
            }
          } catch (err) {
            console.error('Failed to load hls.js:', err);
            setError('Failed to initialize HLS player');
          }
        }
      }
    };

    loadHLS();

    // Cleanup
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, videoType, quadrantIndex]);

  // Check for Netflix
  if (videoType === 'netflix') {
    return (
      <div
        className={`relative w-full h-full bg-zinc-900 flex items-center justify-center cursor-pointer transition-all ${
          isFocused ? 'ring-4 ring-green-500' : ''
        }`}
        onClick={onFocus}
      >
        <div className="text-center p-8">
          <p className="text-red-500 text-lg font-semibold mb-2">⚠️ Netflix Not Supported</p>
          <p className="text-zinc-400 text-sm">
            Netflix content cannot be embedded due to DRM restrictions.
          </p>
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className={`relative w-full h-full bg-zinc-900 flex items-center justify-center cursor-pointer transition-all ${
          isFocused ? 'ring-4 ring-green-500' : ''
        }`}
        onClick={onFocus}
      >
        <div className="text-center p-8">
          <p className="text-zinc-500 text-lg mb-2">Quadrant {quadrantIndex + 1}</p>
          <p className="text-zinc-600 text-sm">Paste a video URL above to start watching</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full bg-black cursor-pointer transition-all ${
        isFocused ? 'ring-4 ring-green-500' : ''
      }`}
      onClick={onFocus}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <div className="text-center p-8 max-w-2xl">
            <p className="text-red-500 text-lg font-semibold mb-2">⚠️ Error Loading Video</p>
            <p className="text-zinc-400 text-sm mb-4">{error}</p>
            
            {error.includes('CORS') && (
              <div className="bg-zinc-800 rounded-lg p-4 mt-4 text-left">
                <p className="text-yellow-500 text-xs font-semibold mb-2">💡 Possible Solutions:</p>
                <ul className="text-zinc-500 text-xs space-y-1 list-disc list-inside">
                  <li>Install a CORS unblock browser extension (e.g., "Allow CORS")</li>
                  <li>Use the streaming site directly in a separate window</li>
                  <li>Try finding public/non-restricted HLS streams</li>
                  <li>Some streams only work on their original site</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : videoType === 'youtube' || videoType === 'twitch' ? (
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: 'none', overflow: 'hidden' }}
          title={`Video player ${quadrantIndex + 1}`}
        />
      ) : videoType === 'hls' ? (
        <div className="relative w-full h-full">
          <video
            ref={videoRef}
            controls
            className="w-full h-full"
            style={{ objectFit: 'contain', backgroundColor: '#000' }}
          />
          {isHovered && (
            <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
              🔴 LIVE
            </div>
          )}
        </div>
      ) : videoType === 'video' ? (
        <video
          src={url}
          controls
          className="w-full h-full"
          style={{ objectFit: 'contain' }}
        />
      ) : videoType === 'streaming-site' ? (
        <div className="relative w-full h-full">
          {iframeBlocked ? (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <div className="text-center p-8 max-w-lg">
                <p className="text-orange-500 text-lg font-semibold mb-3">🚫 Embedding Blocked</p>
                <p className="text-zinc-300 text-sm mb-4">
                  This streaming site prevents embedding with X-Frame-Options.
                </p>
                <div className="flex gap-3 justify-center mb-4">
                  <button
                    onClick={() => {
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    🔄 Try Proxy
                  </button>
                  <button
                    onClick={() => window.open(url, '_blank')}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    🔗 Open in New Window
                  </button>
                </div>
                <div className="bg-zinc-800 rounded-lg p-4 text-left">
                  <p className="text-zinc-400 text-xs font-semibold mb-2">💡 Options:</p>
                  <ul className="text-zinc-500 text-xs space-y-1 list-disc list-inside">
                    <li><strong>Try Proxy:</strong> Routes the page through a proxy server to bypass X-Frame-Options</li>
                    <li><strong>Open in New Window:</strong> Watch in a separate browser tab</li>
                    <li><strong>Extract .m3u8:</strong> Find the direct stream URL in Network tab</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
              <iframe
                ref={iframeRef}
                src={useProxy ? getProxyUrl(url) : url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                {...(!useProxy && { sandbox: "allow-same-origin allow-scripts allow-popups allow-forms allow-presentation" })}
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Streaming site ${quadrantIndex + 1}`}
              />
              {isHovered && (
                <div className="absolute top-4 left-4 bg-purple-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                  {useProxy ? '🔄 PROXIED' : '🌐 STREAMING SITE'}
                </div>
              )}
            </>
          )}
        </div>
      ) : videoType === 'generic' && url ? (
        // Try embedding generic URLs as iframes (might be streaming sites)
        <div className="relative w-full h-full">
          {iframeBlocked ? (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <div className="text-center p-8 max-w-lg">
                <p className="text-orange-500 text-lg font-semibold mb-3">🚫 Embedding Blocked</p>
                <p className="text-zinc-300 text-sm mb-4">
                  This site prevents embedding with X-Frame-Options.
                </p>
                <div className="flex gap-3 justify-center mb-4">
                  <button
                    onClick={() => {
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    🔄 Try Proxy
                  </button>
                  <button
                    onClick={() => window.open(url, '_blank')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    🔗 Open in New Window
                  </button>
                </div>
                <div className="bg-zinc-800 rounded-lg p-4 text-left">
                  <p className="text-zinc-400 text-xs font-semibold mb-2">💡 Options:</p>
                  <ul className="text-zinc-500 text-xs space-y-1 list-disc list-inside">
                    <li><strong>Try Proxy:</strong> Routes through proxy to bypass restrictions</li>
                    <li><strong>Open in New Window:</strong> Watch in separate tab</li>
                    <li>Extract .m3u8 URL for direct HLS playback</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
              <iframe
                ref={iframeRef}
                src={useProxy ? getProxyUrl(url) : url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                {...(!useProxy && { sandbox: "allow-same-origin allow-scripts allow-popups allow-forms allow-presentation" })}
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Generic stream ${quadrantIndex + 1}`}
              />
              {isHovered && (
                <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                  {useProxy ? '🔄 PROXIED' : '🌐 WEB PAGE'}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <div className="text-center p-8">
            <p className="text-yellow-500 text-lg font-semibold mb-2">⚠️ No URL Provided</p>
            <p className="text-zinc-400 text-sm mb-4">
              Paste a video URL above to start watching
            </p>
            <p className="text-zinc-500 text-xs mb-4">
              ✅ Supported: YouTube, Twitch, CrackStreams, StreamEast, HLS (.m3u8), MP4/WebM/OGG
            </p>
            <p className="text-zinc-600 text-xs italic">
              Any HTTP/HTTPS URL will be attempted
            </p>
          </div>
        </div>
      )}

      {/* Expand/Collapse Button - Shows on hover */}
      {isHovered && !error && url && (
        <button
          className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all z-10 shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          {isExpanded ? '◱ Normal' : '⛶ Expand'}
        </button>
      )}
    </div>
  );
}

