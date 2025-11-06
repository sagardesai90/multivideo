'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';

interface VideoPlayerProps {
  url: string;
  quadrantIndex: number;
  isFocused: boolean;
  isExpanded: boolean;
  onFocus: () => void;
  onToggleExpand: () => void;
  isAudioEnabled?: boolean; // Only the focused video should have audio enabled
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

function getYouTubeEmbedUrl(url: string, mute: boolean = false): string {
  let videoId: string | null = null;
  let baseUrl = '';
  
  // Handle youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) {
    videoId = watchMatch[1];
    baseUrl = `https://www.youtube.com/embed/${videoId}`;
  } 
  // Handle youtu.be/VIDEO_ID
  else {
    const shortMatch = url.match(/youtu\.be\/([^?]+)/);
    if (shortMatch) {
      videoId = shortMatch[1];
      baseUrl = `https://www.youtube.com/embed/${videoId}`;
    }
    // Handle youtube.com/embed/VIDEO_ID (already embed URL)
    else if (url.includes('/embed/')) {
      baseUrl = url.split('?')[0]; // Get base URL without params
      videoId = baseUrl.split('/embed/')[1];
    }
    else {
      return url;
    }
  }
  
  // Add parameters
  const params = new URLSearchParams();
  if (mute) {
    params.set('mute', '1');
  }
  // Preserve existing parameters from original URL if any
  const originalParams = new URLSearchParams(url.split('?')[1] || '');
  originalParams.forEach((value, key) => {
    if (key !== 'mute') { // Don't override mute param
      params.set(key, value);
    }
  });
  
  const paramString = params.toString();
  return paramString ? `${baseUrl}?${paramString}` : baseUrl;
}

function getTwitchEmbedUrl(url: string, mute: boolean = false): string {
  const params = new URLSearchParams();
  if (mute) {
    params.set('muted', 'true');
  }
  
  // Handle twitch.tv/channelname
  const channelMatch = url.match(/twitch\.tv\/([^/?]+)/);
  if (channelMatch && !url.includes('/videos/')) {
    params.set('channel', channelMatch[1]);
    params.set('parent', window.location.hostname);
    return `https://player.twitch.tv/?${params.toString()}`;
  }
  
  // Handle twitch.tv/videos/VIDEO_ID
  const videoMatch = url.match(/videos\/(\d+)/);
  if (videoMatch) {
    params.set('video', videoMatch[1]);
    params.set('parent', window.location.hostname);
    return `https://player.twitch.tv/?${params.toString()}`;
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
  isAudioEnabled = true,
}: VideoPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showMutedIndicator, setShowMutedIndicator] = useState(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [showProxiedLabel, setShowProxiedLabel] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mutedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expandButtonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const proxiedLabelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoType = detectVideoType(url);
  
  // Get proxy URL
  const getProxyUrl = (targetUrl: string) => {
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  };
  
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
  
  // Reset state when URL changes
  React.useEffect(() => {
    setIframeBlocked(false);
    setUseProxy(false);
    setShowProxiedLabel(false);
    // Clear proxied label timer
    if (proxiedLabelTimerRef.current) {
      clearTimeout(proxiedLabelTimerRef.current);
      proxiedLabelTimerRef.current = null;
    }
  }, [url, videoType, quadrantIndex]);
  
  // Show proxied label when proxy is enabled, then hide after 2.5 seconds
  useEffect(() => {
    // Clear any existing timer
    if (proxiedLabelTimerRef.current) {
      clearTimeout(proxiedLabelTimerRef.current);
      proxiedLabelTimerRef.current = null;
    }
    
    if (useProxy && (videoType === 'streaming-site' || videoType === 'generic')) {
      // Show the label when proxy is enabled
      setShowProxiedLabel(true);
      
      // Hide after 2.5 seconds
      proxiedLabelTimerRef.current = setTimeout(() => {
        setShowProxiedLabel(false);
      }, 2500);
    } else {
      // Hide immediately when proxy is disabled
      setShowProxiedLabel(false);
    }
    
    return () => {
      if (proxiedLabelTimerRef.current) {
        clearTimeout(proxiedLabelTimerRef.current);
        proxiedLabelTimerRef.current = null;
      }
    };
  }, [useProxy, videoType]);

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

  // Get embed URL based on video type - recalculate when isAudioEnabled changes
  const embedUrl = useMemo(() => {
    if (!url) return '';
    const shouldMute = !isAudioEnabled;
    switch (videoType) {
      case 'youtube':
        return getYouTubeEmbedUrl(url, shouldMute);
      case 'twitch':
        return getTwitchEmbedUrl(url, shouldMute);
      default:
        return url;
    }
  }, [url, videoType, isAudioEnabled]);
  
  // Handle muting for video elements (HLS, direct video files)
  useEffect(() => {
    if (videoRef.current && (videoType === 'hls' || videoType === 'video')) {
      videoRef.current.muted = !isAudioEnabled;
      if (!isAudioEnabled) {
        videoRef.current.volume = 0;
      } else {
        videoRef.current.volume = 1;
      }
    }
  }, [isAudioEnabled, videoType, url]);
  
  // Handle muting for generic iframes via postMessage (for proxy-based streaming sites)
  useEffect(() => {
    if (iframeRef.current && (videoType === 'streaming-site' || videoType === 'generic') && useProxy) {
      // Send mute message to iframe (proxy route has message listener)
      const sendMuteMessage = () => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            { type: 'MUTE_VIDEO', muted: !isAudioEnabled },
            '*'
          );
        }
      };
      
      // Send immediately
      sendMuteMessage();
      
      // Also send after a delay to ensure iframe is fully loaded
      const timer = setTimeout(sendMuteMessage, 1000);
      
      // Listen for iframe load events
      const iframe = iframeRef.current;
      iframe.addEventListener('load', sendMuteMessage);
      
      return () => {
        clearTimeout(timer);
        iframe.removeEventListener('load', sendMuteMessage);
      };
    }
  }, [isAudioEnabled, videoType, useProxy]);
  
  // Show muted indicator when video becomes muted, then hide after 5 seconds
  useEffect(() => {
    // Clear any existing timer
    if (mutedTimerRef.current) {
      clearTimeout(mutedTimerRef.current);
      mutedTimerRef.current = null;
    }
    
    if (!isAudioEnabled) {
      // Show the indicator when video becomes muted
      setShowMutedIndicator(true);
      
      // Hide it after 5 seconds
      mutedTimerRef.current = setTimeout(() => {
        setShowMutedIndicator(false);
      }, 5000);
    } else {
      // Hide immediately when audio is enabled
      setShowMutedIndicator(false);
    }
    
    return () => {
      if (mutedTimerRef.current) {
        clearTimeout(mutedTimerRef.current);
        mutedTimerRef.current = null;
      }
    };
  }, [isAudioEnabled]);

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

  // Handle expand button visibility - show for a few seconds on hover/interaction, hide in portrait
  // IMPORTANT: This must be called before any early returns to follow Rules of Hooks
  useEffect(() => {
    // Clear any existing timer
    if (expandButtonTimerRef.current) {
      clearTimeout(expandButtonTimerRef.current);
      expandButtonTimerRef.current = null;
    }
    
    // Don't show expand button in portrait mode
    if (isPortrait) {
      setShowExpandButton(false);
      return;
    }
    
    // Show expand button on hover/interaction
    if (isHovered && !error && url) {
      setShowExpandButton(true);
      
      // Hide after 5 seconds
      expandButtonTimerRef.current = setTimeout(() => {
        setShowExpandButton(false);
      }, 5000);
    } else {
      // Hide immediately when not hovered
      setShowExpandButton(false);
    }
    
    return () => {
      if (expandButtonTimerRef.current) {
        clearTimeout(expandButtonTimerRef.current);
        expandButtonTimerRef.current = null;
      }
    };
  }, [isHovered, isPortrait, error, url]);
  
  // Also show expand button on touch/interaction (for mobile)
  const handleInteraction = () => {
    if (!isPortrait && !error && url) {
      setShowExpandButton(true);
      // Clear existing timer
      if (expandButtonTimerRef.current) {
        clearTimeout(expandButtonTimerRef.current);
      }
      // Hide after 5 seconds
      expandButtonTimerRef.current = setTimeout(() => {
        setShowExpandButton(false);
      }, 5000);
    }
  };

  // Check for Netflix - MUST be after all hooks
  if (videoType === 'netflix') {
    return (
      <div
        className="relative w-full h-full bg-zinc-950 flex items-center justify-center cursor-pointer transition-all"
        onClick={onFocus}
      >
        <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-red-900/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-white text-sm font-medium mb-1 px-2">Netflix Not Supported</h3>
          <p className="text-zinc-400 text-xs leading-tight px-2">
            DRM prevents embedding
          </p>
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className="relative w-full h-full bg-zinc-950 flex items-center justify-center cursor-pointer transition-all"
        onClick={onFocus}
      >
        <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/30 flex items-center justify-center flex-shrink-0">
            <span className="text-zinc-500 text-base font-semibold">{quadrantIndex + 1}</span>
          </div>
          <p className="text-zinc-400 text-xs">Empty slot</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full bg-black cursor-pointer transition-all"
      onClick={(e) => {
        onFocus();
        handleInteraction();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleInteraction}
    >
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden">
          <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center max-w-full overflow-y-auto">
            <div className="mb-3 flex-shrink-0">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-red-900/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-white text-sm font-semibold mb-1 px-2">Error Loading Video</h3>
              <p className="text-zinc-400 text-xs leading-tight px-2 line-clamp-2">{error}</p>
            </div>
            
            {error.includes('CORS') && (
              <div className="bg-zinc-800/50 rounded-lg p-3 mt-2 text-left border border-zinc-700/50 flex-shrink-0 w-full max-w-[90%]">
                <p className="text-zinc-300 text-xs font-medium mb-1.5">Possible solutions:</p>
                <ul className="text-zinc-400 text-xs space-y-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-zinc-500 mt-0.5 flex-shrink-0">•</span>
                    <span>Install CORS extension</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-zinc-500 mt-0.5 flex-shrink-0">•</span>
                    <span>Try site directly</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-zinc-500 mt-0.5 flex-shrink-0">•</span>
                    <span>Use public HLS streams</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : videoType === 'youtube' || videoType === 'twitch' ? (
        <div className="relative w-full h-full" style={{ overflow: 'hidden', width: '100%', height: '100%' }}>
          <iframe
            key={embedUrl} // Force re-render when URL changes (important for mute param)
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            style={{ 
              border: 'none', 
              overflow: 'hidden',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            title={`Video player ${quadrantIndex + 1}`}
          />
          {showMutedIndicator && (
            <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
              🔇 Muted
            </div>
          )}
        </div>
      ) : videoType === 'hls' ? (
        <div className="relative w-full h-full" style={{ overflow: 'hidden' }}>
          <video
            ref={videoRef}
            controls
            muted={!isAudioEnabled}
            className="w-full h-full"
            style={{ 
              objectFit: 'cover', 
              backgroundColor: '#000',
              width: '100%',
              height: '100%',
            }}
          />
          {isHovered && (
            <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
              🔴 LIVE
            </div>
          )}
          {showMutedIndicator && (
            <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
              🔇 Muted
            </div>
          )}
        </div>
      ) : videoType === 'video' ? (
        <div className="relative w-full h-full" style={{ overflow: 'hidden' }}>
          <video
            ref={videoRef}
            src={url}
            controls
            muted={!isAudioEnabled}
            className="w-full h-full"
            style={{ 
              objectFit: 'cover',
              width: '100%',
              height: '100%',
            }}
          />
          {showMutedIndicator && (
            <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
              🔇 Muted
            </div>
          )}
        </div>
      ) : videoType === 'streaming-site' ? (
        <div className="relative w-full h-full">
          {iframeBlocked ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden">
              <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center max-w-full">
                <div className="mb-3 flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold mb-1 px-2">Embedding Restricted</h3>
                  <p className="text-zinc-400 text-xs leading-tight px-2">
                    Site prevents embedded playback
                  </p>
                </div>
                <div className="space-y-2 w-full px-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Try Proxy</span>
                  </button>
                  <button
                    onClick={() => window.open(url, '_blank')}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>New Tab</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <iframe
                ref={iframeRef}
                src={useProxy ? getProxyUrl(url) : url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Streaming site ${quadrantIndex + 1}`}
              />
              {showProxiedLabel && useProxy && (
                <div className="absolute top-4 left-4 bg-purple-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
                  🔄 PROXIED
                </div>
              )}
              {isHovered && !useProxy && (
                <div className="absolute top-4 left-4 bg-purple-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                  🌐 STREAMING SITE
                </div>
              )}
              {showMutedIndicator && (
                <div className={`absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300 ${showMutedIndicator ? 'opacity-100' : 'opacity-0'}`}>
                  🔇 Muted
                </div>
              )}
            </>
          )}
        </div>
      ) : videoType === 'generic' && url ? (
        // Try embedding generic URLs as iframes (might be streaming sites)
        <div className="relative w-full h-full">
          {iframeBlocked ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden">
              <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center max-w-full">
                <div className="mb-3 flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold mb-1 px-2">Embedding Restricted</h3>
                  <p className="text-zinc-400 text-xs leading-tight px-2">
                    Site prevents embedded playback
                  </p>
                </div>
                <div className="space-y-2 w-full px-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Try Proxy</span>
                  </button>
                  <button
                    onClick={() => window.open(url, '_blank')}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>New Tab</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <iframe
                ref={iframeRef}
                src={useProxy ? getProxyUrl(url) : url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Generic stream ${quadrantIndex + 1}`}
              />
              {showProxiedLabel && useProxy && (
                <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
                  🔄 PROXIED
                </div>
              )}
              {isHovered && !useProxy && (
                <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                  🌐 WEB PAGE
                </div>
              )}
              {showMutedIndicator && (
                <div className={`absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300 ${showMutedIndicator ? 'opacity-100' : 'opacity-0'}`}>
                  🔇 Muted
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 overflow-hidden">
          <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-white text-sm font-medium mb-1 px-2">No Video URL</h3>
            <p className="text-zinc-400 text-xs leading-tight px-2">
              Paste URL above to start
            </p>
          </div>
        </div>
      )}

      {/* Expand/Collapse Button - Shows on hover/interaction for a few seconds (hidden in portrait) */}
      {showExpandButton && (
        <button
          className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-300 z-10 shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
            handleInteraction(); // Reset timer on click
          }}
        >
          {isExpanded ? '◱ Normal' : '⛶ Expand'}
        </button>
      )}
    </div>
  );
}

