'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface VideoPlayerProps {
  url: string;
  quadrantIndex: number;
  isFocused: boolean;
  isExpanded: boolean;
  onFocus: () => void;
  onToggleExpand: () => void;
  onRemove?: () => void;
  isAudioEnabled?: boolean; // Only the focused video should have audio enabled
  isDraggedOver?: boolean; // Whether another slot is being dragged over this one
  isDragging?: boolean; // Whether this slot is currently being dragged
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
    lowerUrl.includes('istreameast') ||
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
  onRemove,
  isAudioEnabled = true,
  isDraggedOver = false,
  isDragging = false,
}: VideoPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showMutedIndicator, setShowMutedIndicator] = useState(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [showMobileLabels, setShowMobileLabels] = useState(false);
  const [showProxiedLabel, setShowProxiedLabel] = useState(false);
  const [isExtractingStream, setIsExtractingStream] = useState(false);
  const [extractedStream, setExtractedStream] = useState<{ url: string; type: 'iframe' | 'hls' } | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const detectMobile = () => {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0;
      return /android|iphone|ipad|ipod|mobile/i.test(ua) || coarsePointer || hasTouch;
    };

    setIsMobileDevice(detectMobile());

    return () => {
      setIsMobileDevice(false);
    };
  }, []);
  const isCrackstreamsUrl = useMemo(() => {
    if (!url) return false;
    return url.toLowerCase().includes('crackstreams');
  }, [url]);
  const sandboxAttributes = 'allow-same-origin allow-scripts allow-forms allow-presentation';
  const mutedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expandButtonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const proxiedLabelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mobileLabelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoType = detectVideoType(url);
  const getProxyUrl = (targetUrl: string) => {
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  };
  const streamingBaseUrl = useMemo(() => {
    if (videoType === 'streaming-site' && extractedStream?.url) {
      return extractedStream.url;
    }
    return url;
  }, [url, videoType, extractedStream?.url]);
  // Prefer direct iframe loading (client-side) so requests come from user's browser IP
  // Only use proxy if X-Frame-Options blocks direct embedding
  const streamingIframeSrc = useMemo(() => {
    if (!streamingBaseUrl) return '';
    // Always try direct loading first - browser makes request from user's IP
    // Proxy is only used as fallback if X-Frame-Options blocks embedding
    return useProxy ? getProxyUrl(streamingBaseUrl) : streamingBaseUrl;
  }, [streamingBaseUrl, useProxy]);

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
  // Always start with direct iframe loading (client-side) - this ensures requests
  // come from the user's browser IP, not Vercel's server IP
  React.useEffect(() => {
    setIframeBlocked(false);
    setUseProxy(false); // Always start with direct loading (client-side)
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

  const triggerMobileLabels = useCallback(() => {
    if (!isMobileDevice) {
      return;
    }

    setShowMobileLabels(true);

    if (mobileLabelTimerRef.current) {
      clearTimeout(mobileLabelTimerRef.current);
    }

    mobileLabelTimerRef.current = setTimeout(() => {
      setShowMobileLabels(false);
      mobileLabelTimerRef.current = null;
    }, 3500);
  }, [isMobileDevice]);

  useEffect(() => {
    return () => {
      if (mobileLabelTimerRef.current) {
        clearTimeout(mobileLabelTimerRef.current);
        mobileLabelTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mobileLabelTimerRef.current) {
      clearTimeout(mobileLabelTimerRef.current);
      mobileLabelTimerRef.current = null;
    }
    setShowMobileLabels(false);
  }, [url]);

  const isSameOriginUrl = useCallback((target?: string | null) => {
    if (!target || typeof window === 'undefined') return false;
    try {
      const parsed = new URL(target, window.location.href);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }, []);

  const shouldSkipEmbeddingCheck = useMemo(() => {
    if (!streamingBaseUrl) return false;
    try {
      const hostname = new URL(streamingBaseUrl).hostname;
      const allowlist = ['embednow.top', 'embednow.online', 'embedstream.tv'];
      return allowlist.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }, [streamingBaseUrl]);

  // Check if iframe is blocked by X-Frame-Options (skip for trusted cross-origin hosts)
  useEffect(() => {
    const iframeTarget = videoType === 'streaming-site' ? streamingIframeSrc : url;
    const shouldCheck =
      (videoType === 'streaming-site' || videoType === 'generic') &&
      iframeTarget &&
      (isSameOriginUrl(iframeTarget) || !shouldSkipEmbeddingCheck);

    if (!shouldCheck) {
      setIframeBlocked(false);
      return;
    }

    setIframeBlocked(false);
    const timer = setTimeout(() => {
      try {
        if (iframeRef.current) {
          const iframeDoc = iframeRef.current.contentDocument;
          if (!iframeDoc || !iframeDoc.body || iframeDoc.body.innerHTML === '') {
            setIframeBlocked(true);
          }
        }
      } catch (e) {
        setIframeBlocked(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    url,
    videoType,
    quadrantIndex,
    streamingBaseUrl,
    streamingIframeSrc,
    isSameOriginUrl,
    shouldSkipEmbeddingCheck,
  ]);
  useEffect(() => {
    if (!url || !isCrackstreamsUrl || videoType !== 'streaming-site') {
      setIsExtractingStream(false);
      setExtractionError(null);
      setExtractedStream(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const extractStream = async () => {
      setIsExtractingStream(true);
      setExtractionError(null);
      try {
        const response = await fetch(`/api/extract/crackstreams?url=${encodeURIComponent(url)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (cancelled) return;

        if (response.ok && data?.embedUrl) {
          setExtractedStream({
            url: data.embedUrl,
            type: data.streamType === 'hls' ? 'hls' : 'iframe',
          });
        } else {
          setExtractionError(data?.error || 'Unable to extract CrackStreams player');
          setExtractedStream(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setExtractionError(err instanceof Error ? err.message : 'Unable to extract CrackStreams player');
        setExtractedStream(null);
      } finally {
        if (!cancelled) {
          setIsExtractingStream(false);
        }
      }
    };

    extractStream();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, isCrackstreamsUrl, videoType]);

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
  const handleInteraction = useCallback(() => {
    triggerMobileLabels();
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
  }, [triggerMobileLabels, isPortrait, error, url]);

  const showHoverLabels = isMobileDevice ? showMobileLabels : isHovered;

  // Check for Netflix - MUST be after all hooks
  if (videoType === 'netflix') {
    return (
      <div
        className="relative w-full h-full bg-zinc-950 flex items-center justify-center cursor-pointer transition-all"
        onClick={() => {
          onFocus();
          handleInteraction();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleInteraction}
      >
        {showHoverLabels && (
          <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
            {quadrantIndex + 1}
          </div>
        )}
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
    // Generate class names based on drag state for empty slots
    const emptyDragStateClasses = isDraggedOver
      ? 'ring-4 ring-blue-500 ring-opacity-75'
      : isDragging
        ? 'opacity-50'
        : '';

    return (
      <div
        className={`relative w-full h-full bg-zinc-950 flex items-center justify-center cursor-pointer transition-all ${emptyDragStateClasses}`}
        onClick={() => {
          onFocus();
          handleInteraction();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleInteraction}
      >
        {/* Drag overlay indicator for empty slots */}
        {isDraggedOver && (
          <div className="absolute inset-0 bg-blue-500/20 z-30 pointer-events-none flex items-center justify-center">
            <div className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-lg">
              Drop here to move
            </div>
          </div>
        )}
        {showHoverLabels && (
          <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
            {quadrantIndex + 1}
          </div>
        )}
        <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/30 flex items-center justify-center flex-shrink-0">
            <span className="text-zinc-500 text-base font-semibold">{quadrantIndex + 1}</span>
          </div>
          <p className="text-zinc-400 text-xs">Empty slot</p>
        </div>
      </div>
    );
  }

  // Generate class names based on drag state
  const dragStateClasses = isDraggedOver
    ? 'ring-4 ring-blue-500 ring-opacity-75'
    : isDragging
      ? 'opacity-50'
      : '';

  return (
    <div
      className={`relative w-full h-full bg-black cursor-pointer transition-all ${dragStateClasses}`}
      onClick={(e) => {
        // Don't trigger click during drag operations
        if (isDragging || isDraggedOver) {
          e.stopPropagation();
          return;
        }
        onFocus();
        handleInteraction();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleInteraction}
    >
      {/* Drag overlay indicator */}
      {isDraggedOver && (
        <div className="absolute inset-0 bg-blue-500/20 z-30 pointer-events-none flex items-center justify-center">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-lg">
            Drop here to swap
          </div>
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden">
          {showHoverLabels && (
            <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
              {quadrantIndex + 1}
            </div>
          )}
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
          {showHoverLabels && (
            <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
              {quadrantIndex + 1}
            </div>
          )}
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
          {showHoverLabels && (
            <>
              <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                {quadrantIndex + 1}
              </div>
              <div className="absolute top-14 left-4 bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                🔴 LIVE
              </div>
            </>
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
          {showHoverLabels && (
            <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
              {quadrantIndex + 1}
            </div>
          )}
          {showMutedIndicator && (
            <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
              🔇 Muted
            </div>
          )}
        </div>
      ) : videoType === 'streaming-site' ? (
        <div className="relative w-full h-full">
          {iframeBlocked && !useProxy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden">
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {quadrantIndex + 1}
                </div>
              )}
              <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center max-w-full">
                <div className="mb-3 flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold mb-1 px-2">Embedding Restricted</h3>
                  <p className="text-zinc-400 text-xs leading-tight px-2">
                    Site prevents embedded playback. Requests are made from your browser.
                  </p>
                </div>
                <div className="space-y-2 w-full px-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      // Try proxy as fallback (may be blocked on Vercel)
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Try Proxy (May Fail)</span>
                  </button>
                  <button
                    onClick={() => {
                      // Force direct loading - retry with direct iframe
                      setIframeBlocked(false);
                      setUseProxy(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Retry Direct</span>
                  </button>
                  <button
                    onClick={() => window.open(streamingBaseUrl || url, '_blank')}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>Open in New Tab</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isExtractingStream && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm font-semibold z-30">
                  Fetching CrackStreams player...
                </div>
              )}
              {extractionError && !isExtractingStream && (
                <div className="absolute bottom-4 left-4 bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none z-30 shadow-lg">
                  ⚠️ {extractionError}
                </div>
              )}
              <iframe
                ref={iframeRef}
                // Always prefer direct URL (client-side) - browser makes request from user's IP
                // Only use proxy if explicitly enabled (as fallback for X-Frame-Options)
                src={streamingIframeSrc || url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                {...(isMobileDevice
                  ? { sandbox: sandboxAttributes }
                  : {})}
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Streaming site ${quadrantIndex + 1}`}
              />
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {quadrantIndex + 1}
                </div>
              )}
              {showProxiedLabel && useProxy && (
                <div className="absolute top-14 left-4 bg-purple-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
                  🔄 PROXIED
                </div>
              )}
              {showHoverLabels && !useProxy && (
                <div className="absolute top-14 left-4 bg-purple-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                  🌐 STREAMING SITE
                </div>
              )}
              {/* Mute indicator removed for streaming sites - mute control is inconsistent and not functional for iframes */}
            </>
          )}
        </div>
      ) : videoType === 'generic' && url ? (
        // Try embedding generic URLs as iframes (might be streaming sites)
        <div className="relative w-full h-full">
          {iframeBlocked && !useProxy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden">
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {quadrantIndex + 1}
                </div>
              )}
              <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center max-w-full">
                <div className="mb-3 flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold mb-1 px-2">Embedding Restricted</h3>
                  <p className="text-zinc-400 text-xs leading-tight px-2">
                    Site prevents embedded playback. Requests are made from your browser.
                  </p>
                </div>
                <div className="space-y-2 w-full px-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      // Try proxy as fallback (may be blocked on Vercel)
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Try Proxy (May Fail)</span>
                  </button>
                  <button
                    onClick={() => {
                      // Force direct loading - retry with direct iframe
                      setIframeBlocked(false);
                      setUseProxy(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Retry Direct</span>
                  </button>
                  <button
                    onClick={() => window.open(url, '_blank')}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>Open in New Tab</span>
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
                {...(isMobileDevice
                  ? { sandbox: sandboxAttributes }
                  : {})}
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Generic stream ${quadrantIndex + 1}`}
              />
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {quadrantIndex + 1}
                </div>
              )}
              {showProxiedLabel && useProxy && (
                <div className="absolute top-14 left-4 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity duration-300">
                  🔄 PROXIED
                </div>
              )}
              {showHoverLabels && !useProxy && (
                <div className="absolute top-14 left-4 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none transition-opacity">
                  🌐 WEB PAGE
                </div>
              )}
              {/* Mute indicator removed for generic iframes - mute control is inconsistent and not functional for iframes */}
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 overflow-hidden">
          {showHoverLabels && (
            <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
              {quadrantIndex + 1}
            </div>
          )}
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

      {/* Top Control Bar - Shows on hover/interaction (hidden in portrait) */}
      {showExpandButton && (
        <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-start z-20 pointer-events-none">
          {/* Expand/Collapse Button - Top Left */}
          <button
            className="bg-black/70 hover:bg-black/90 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 shadow-lg pointer-events-auto flex items-center gap-1.5 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
              handleInteraction(); // Reset timer on click
            }}
            title={isExpanded ? "Minimize" : "Maximize"}
          >
            {isExpanded ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0m-5 0l0 5M15 15l5 5m0 0l-5 0m5 0l0-5" />
                </svg>
                <span>Minimize</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M8 20H4m0 0v-4m0 4l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span>Expand</span>
              </>
            )}
          </button>

          {/* Delete Button - Top Right */}
          {onRemove && (
            <button
              className="bg-red-600/80 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 shadow-lg pointer-events-auto flex items-center gap-1.5 backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Remove this video?')) {
                  onRemove();
                }
                handleInteraction();
              }}
              title="Remove video"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Remove</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

