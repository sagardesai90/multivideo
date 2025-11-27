'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface VideoPlayerProps {
  url: string;
  quadrantIndex: number; // Slot index (for internal logic)
  position: number; // Visual position (0-based) - used for display
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

function VideoPlayerComponent({
  url,
  quadrantIndex,
  position,
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmDeleteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  // Streameast server options state
  const [streameastServers, setStreameastServers] = useState<Array<{ name: string; url: string }>>([]);
  const [selectedStreameastServer, setSelectedStreameastServer] = useState<string | null>(null);
  const [isFetchingStreameastServers, setIsFetchingStreameastServers] = useState(false);
  const [showServerSelector, setShowServerSelector] = useState(false);
  const [isSwitchingServer, setIsSwitchingServer] = useState(false);
  const [streameastExtractionError, setStreameastExtractionError] = useState<string | null>(null);
  const [showStreamingOptions, setShowStreamingOptions] = useState(false);
  const [useFallbackProxy, setUseFallbackProxy] = useState(false);
  const [showLoadChoiceOverlay, setShowLoadChoiceOverlay] = useState(false);
  const [hasUserMadeChoice, setHasUserMadeChoice] = useState(false);
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
  
  const isStreameastUrl = useMemo(() => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('streameast') || lowerUrl.includes('istreameast');
  }, [url]);
  const sandboxAttributes = 'allow-same-origin allow-scripts allow-forms allow-presentation';
  const mutedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expandButtonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const proxiedLabelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mobileLabelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const detectedVideoType = detectVideoType(url);
  // Override video type if we extracted a direct HLS stream
  const videoType = (extractedStream?.type === 'hls') ? 'hls' : detectedVideoType;
  const getProxyUrl = (targetUrl: string, useFallback: boolean = false) => {
    // Use fallback proxy (Railway) if configured and requested
    const fallbackProxyUrl = process.env.NEXT_PUBLIC_FALLBACK_PROXY_URL;
    if (useFallback && fallbackProxyUrl) {
      console.log('[PROXY] Using fallback proxy:', fallbackProxyUrl);
      return `${fallbackProxyUrl}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    // Use primary proxy (this server - Vercel)
    console.log('[PROXY] Using primary proxy:', fallbackProxyUrl ? 'Fallback available' : 'No fallback configured');
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  };
  const streamingBaseUrl = useMemo(() => {
    // If we have a direct HLS stream, use it
    if (extractedStream?.type === 'hls' && extractedStream.url) {
      return extractedStream.url;
    }
    
    if (detectedVideoType === 'streaming-site') {
      // For Streameast, use selected server URL if available, otherwise use extracted/default
      if (isStreameastUrl && selectedStreameastServer) {
        return selectedStreameastServer;
      }
      if (extractedStream?.url) {
        return extractedStream.url;
      }
    }
    return url;
  }, [url, detectedVideoType, extractedStream, isStreameastUrl, selectedStreameastServer]);
  // Prefer direct iframe loading (client-side) so requests come from user's browser IP
  // Only use proxy if X-Frame-Options blocks direct embedding
  const streamingIframeSrc = useMemo(() => {
    if (!streamingBaseUrl) return '';
    // Always try direct loading first - browser makes request from user's IP
    // Proxy is only used as fallback if X-Frame-Options blocks embedding
    return useProxy ? getProxyUrl(streamingBaseUrl, useFallbackProxy) : streamingBaseUrl;
  }, [streamingBaseUrl, useProxy, useFallbackProxy]);

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
    setShowServerSelector(false);
    setStreameastExtractionError(null);
    setShowStreamingOptions(false);
    setUseFallbackProxy(false); // Reset to primary proxy on URL change
    setShowLoadChoiceOverlay(false);
    setHasUserMadeChoice(false);
    console.log('[PROXY] Reset state for new URL');
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

  // Close server selector when clicking outside
  useEffect(() => {
    if (!showServerSelector) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-server-selector]')) {
        setShowServerSelector(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showServerSelector]);

  // Close streaming options dropdown when clicking outside
  useEffect(() => {
    if (!showStreamingOptions) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-streaming-options]')) {
        setShowStreamingOptions(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showStreamingOptions]);

  useEffect(() => {
    return () => {
      if (mobileLabelTimerRef.current) {
        clearTimeout(mobileLabelTimerRef.current);
        mobileLabelTimerRef.current = null;
      }
      if (confirmDeleteTimerRef.current) {
        clearTimeout(confirmDeleteTimerRef.current);
        confirmDeleteTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mobileLabelTimerRef.current) {
      clearTimeout(mobileLabelTimerRef.current);
      mobileLabelTimerRef.current = null;
    }
    setShowMobileLabels(false);
    setConfirmDelete(false);
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
      const allowlist = [
        'embednow.top', 
        'embednow.online', 
        'embedstream.tv',
        'embedsports.top', // Streameast embedding domain
        'embedsports.online',
        'embedstream.top',
      ];
      return allowlist.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }, [streamingBaseUrl]);

  // Check if iframe is blocked by X-Frame-Options or other issues
  // Use load event and dimensions check instead of contentDocument (which is null for cross-origin)
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
    let loadTimer: NodeJS.Timeout;
    let blockedCheckTimer: NodeJS.Timeout;
    let hasLoaded = false;

    const handleIframeLoad = () => {
      hasLoaded = true;
      setIframeBlocked(false);
      if (loadTimer) clearTimeout(loadTimer);
      if (blockedCheckTimer) clearTimeout(blockedCheckTimer);
      
      // For proxy mode, check after load if content is actually accessible
      if (useProxy) {
        setTimeout(() => {
          if (iframeRef.current) {
            try {
              // Try to check if iframe content is accessible
              const iframeDoc = iframeRef.current.contentDocument;
              // If we can access it and it's empty or has error content, mark as blocked
              if (iframeDoc && iframeDoc.body) {
                const bodyText = iframeDoc.body.textContent || '';
                const bodyHTML = iframeDoc.body.innerHTML || '';
                
                // Only mark as blocked if we see SPECIFIC error messages AND no video player
                const hasErrorMessage = (
                  bodyText.toLowerCase().includes('remove sandbox attributes') || 
                  bodyText.toLowerCase().includes('not allowed to be embedded') ||
                  (bodyText.toLowerCase().includes('iframe') && bodyText.toLowerCase().includes('sandbox') && bodyText.length < 500)
                );
                
                // Check if there's actually a video player present
                const hasVideoPlayer = (
                  bodyHTML.includes('<video') || 
                  bodyHTML.includes('jwplayer') || 
                  bodyHTML.includes('video-js') ||
                  iframeDoc.querySelector('video') !== null
                );
                
                // Only show error if we have error message AND no video player
                if (hasErrorMessage && !hasVideoPlayer) {
                  console.warn('[PROXY] Detected error message in proxied content - showing overlay');
                  setIframeBlocked(true);
                  setHasUserMadeChoice(true); // Keep overlay in "error" mode
                } else if (hasVideoPlayer) {
                  console.log('[PROXY] Video player detected - proxy is working');
                  setIframeBlocked(false);
                }
              }
            } catch (e) {
              // Cross-origin, can't check
              // For cross-origin proxied content, if we see the error visually,
              // we can't detect it programmatically, so overlay won't auto-trigger
              console.log('[PROXY] Cross-origin iframe, cannot check content');
            }
          }
        }, 4000); // Check 4 seconds after load to give page time to render
      }
    };

    const checkIfBlocked = () => {
      if (hasLoaded) return; // Already loaded, not blocked
      
      if (iframeRef.current) {
        // Check if iframe has dimensions (indicates content loaded)
        const rect = iframeRef.current.getBoundingClientRect();
        const hasDimensions = rect.width > 0 && rect.height > 0;
        
        // For same-origin, check contentDocument
        // For cross-origin, we rely on load event and dimensions
        if (isSameOriginUrl(iframeTarget)) {
          try {
            const iframeDoc = iframeRef.current.contentDocument;
            if (!iframeDoc || !iframeDoc.body || iframeDoc.body.innerHTML === '') {
              setIframeBlocked(true);
              return;
            }
          } catch (e) {
            setIframeBlocked(true);
            return;
          }
        }
        
        // If we have dimensions or iframe loaded, it's not blocked
        if (hasDimensions) {
          setIframeBlocked(false);
          return;
        }
        
        // If no dimensions and no load event after delay, likely blocked
        // But give it more time - some sites take longer to load
        blockedCheckTimer = setTimeout(() => {
          if (!hasLoaded && iframeRef.current) {
            const finalRect = iframeRef.current.getBoundingClientRect();
            if (finalRect.width === 0 && finalRect.height === 0) {
              setIframeBlocked(true);
            }
          }
        }, 5000); // Wait 5 seconds before assuming blocked
      }
    };

    if (iframeRef.current) {
      // Listen for load event
      iframeRef.current.addEventListener('load', handleIframeLoad);
      
      // Initial check after short delay
      loadTimer = setTimeout(() => {
        checkIfBlocked();
      }, 3000); // Give iframe 3 seconds to load before first check
    }

    return () => {
      if (loadTimer) clearTimeout(loadTimer);
      if (blockedCheckTimer) clearTimeout(blockedCheckTimer);
      if (iframeRef.current) {
        iframeRef.current.removeEventListener('load', handleIframeLoad);
      }
    };
  }, [
    url,
    videoType,
    quadrantIndex,
    streamingBaseUrl,
    streamingIframeSrc,
    useProxy,
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

  // Fetch Streameast server options
  useEffect(() => {
    if (!url || !isStreameastUrl || videoType !== 'streaming-site') {
      setStreameastServers([]);
      setSelectedStreameastServer(null);
      setIsFetchingStreameastServers(false);
      setStreameastExtractionError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchServers = async () => {
      setIsFetchingStreameastServers(true);
      setStreameastExtractionError(null);
      try {
        const response = await fetch(`/api/extract/streameast?url=${encodeURIComponent(url)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (cancelled) return;

        if (response.ok && data?.servers && Array.isArray(data.servers) && data.servers.length > 0) {
          setStreameastServers(data.servers);
          // Set default server URL
          if (data.defaultServerUrl) {
            setSelectedStreameastServer(data.defaultServerUrl);
            setExtractedStream({
              url: data.defaultServerUrl,
              type: 'iframe',
            });
          }
          setStreameastExtractionError(null);
        } else {
          // Extraction failed - set error message
          const errorMsg = data?.error || 'Failed to extract Streameast servers';
          setStreameastExtractionError(errorMsg);
          // Fallback to using the original URL directly
          setSelectedStreameastServer(null);
          setExtractedStream({
            url: url,
            type: 'iframe',
          });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch Streameast servers';
        setStreameastExtractionError(errorMsg);
        console.error('Failed to fetch Streameast servers:', err);
        // Fallback to using the original URL directly
        setSelectedStreameastServer(null);
        setExtractedStream({
          url: url,
          type: 'iframe',
        });
      } finally {
        if (!cancelled) {
          setIsFetchingStreameastServers(false);
        }
      }
    };

    fetchServers();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, isStreameastUrl, videoType]);

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

    // Show expand button on hover - KEEP it shown while hovering
    if (isHovered) {
      setShowExpandButton(true);
      // No timeout here - we want it to stay visible while hovering
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
    if (!isPortrait) {
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
            {position + 1}
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
            {position + 1}
          </div>
        )}
        <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-zinc-800/30 flex items-center justify-center flex-shrink-0">
            <span className="text-zinc-500 text-base font-semibold">{position + 1}</span>
          </div>
          <p className="text-zinc-400 text-xs">Empty slot</p>
        </div>

        {/* Top Control Bar for Empty Slot */}
        {showExpandButton && onRemove && (
          <div className="absolute top-0 right-0 p-2 flex justify-end items-start z-20 pointer-events-none">
            <button
              className="bg-zinc-800/80 hover:bg-red-600 text-zinc-400 hover:text-white w-8 h-8 rounded-lg transition-all duration-200 shadow-lg pointer-events-auto flex items-center justify-center backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
                handleInteraction();
              }}
              title="Remove slot"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
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
              {position + 1}
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
            key={`${quadrantIndex}-${url}`} // Stable key based on slot and URL, not mute param
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
            title={`Video player ${position + 1}`}
          />
          {showHoverLabels && (
            <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
              {position + 1}
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
                {position + 1}
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
              {position + 1}
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
          {/* Only show choice overlay if we don't have a direct HLS stream */}
          {(!hasUserMadeChoice || iframeBlocked) && extractedStream?.type !== 'hls' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm overflow-hidden z-40">
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {position + 1}
                </div>
              )}
              <div className="text-center px-4 py-4 w-full h-full flex flex-col items-center justify-center max-w-full">
                <div className="mb-3 flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold mb-1 px-2">
                    {iframeBlocked && hasUserMadeChoice 
                      ? (useProxy ? 'Proxy Failed to Load' : 'Embedding Restricted')
                      : 'Choose Loading Method'}
                  </h3>
                  <p className="text-zinc-400 text-xs leading-tight px-2">
                    {iframeBlocked && hasUserMadeChoice
                      ? (useProxy 
                          ? 'The proxy could not load this page. Try direct mode or open in a new tab.'
                          : 'Site prevents embedded playback. Try using the proxy or open directly.')
                      : 'How would you like to load this streaming site?'}
                  </p>
                </div>
                <div className="space-y-2 w-full px-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      setHasUserMadeChoice(true);
                      setUseProxy(true);
                      setIframeBlocked(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Use Proxy (Bypass Blocks)</span>
                  </button>
                  <button
                    onClick={() => {
                      setHasUserMadeChoice(true);
                      setIframeBlocked(false);
                      setUseProxy(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <span>Stream Direct (Your IP)</span>
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
              {(isExtractingStream || isFetchingStreameastServers || isSwitchingServer) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm font-semibold z-30">
                  {isSwitchingServer 
                    ? 'Switching server...' 
                    : isFetchingStreameastServers 
                      ? 'Fetching Streameast servers...' 
                      : 'Fetching CrackStreams player...'}
                </div>
              )}
              {/* Only show extraction errors if stream is not playing */}
              {extractionError && !isExtractingStream && !hasUserMadeChoice && (
                <div className="absolute bottom-4 left-4 bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold pointer-events-none z-30 shadow-lg">
                  ⚠️ {extractionError}
                </div>
              )}
              {/* Only show Streameast extraction errors if no choice has been made yet */}
              {streameastExtractionError && !isFetchingStreameastServers && isStreameastUrl && !hasUserMadeChoice && !extractedStream && (
                <div className="absolute bottom-4 left-4 bg-orange-600 text-white px-3 py-1.5 rounded text-xs font-semibold z-30 shadow-lg max-w-[80%] pointer-events-auto">
                  <div className="flex items-center gap-2">
                    <span>⚠️ {streameastExtractionError}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHasUserMadeChoice(true);
                        setUseProxy(true);
                        setIframeBlocked(false);
                        setStreameastExtractionError(null);
                      }}
                      className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-xs font-bold transition-colors"
                      title="Use proxy to bypass connection issues"
                    >
                      Use Proxy
                    </button>
                  </div>
                </div>
              )}
              <iframe
                ref={(el) => {
                  // Store ref for muting control
                  if (el) {
                    (iframeRef as any).current = el;
                    // Forcefully remove sandbox attribute when using proxy
                    if (useProxy && el.hasAttribute('sandbox')) {
                      el.removeAttribute('sandbox');
                    }
                  }
                }}
                // Key changes when server changes or proxy mode changes, forcing complete remount
                // This ensures a clean iframe element, preventing browser navigation warnings
                key={`${isStreameastUrl && selectedStreameastServer 
                  ? `streameast-${selectedStreameastServer}` 
                  : `streaming-${quadrantIndex}-${streamingIframeSrc || url}`}-${useProxy ? 'proxy' : 'direct'}`}
                // Always prefer direct URL (client-side) - browser makes request from user's IP
                // Only use proxy if explicitly enabled (as fallback for X-Frame-Options)
                src={streamingIframeSrc || url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                {...(!useProxy && isMobileDevice ? { sandbox: sandboxAttributes } : {})}
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Streaming site ${position + 1}`}
                // Prevent navigation events from bubbling up
                onLoad={(e) => {
                  e.stopPropagation();
                  // Reset iframe blocked check when iframe loads
                  setIframeBlocked(false);
                  setIsSwitchingServer(false);
                  
                  // If using proxy, check after a delay if the page loaded successfully
                  // Some sites show errors even when embedded via proxy
                  if (useProxy) {
                    setTimeout(() => {
                      try {
                        const iframe = (e.target as HTMLIFrameElement);
                        // Try to detect if the embedded page is showing an error
                        // If we can't access the content, assume it loaded (cross-origin)
                        // If it's showing an error about sandbox/embedding, we'll let user see it
                        // and they can use the dropdown to switch modes
                      } catch (err) {
                        // Cross-origin - can't check, assume it's working
                      }
                    }, 3000);
                  }
                }}
                onError={(e) => {
                  e.stopPropagation();
                  console.error('Iframe failed to load', useProxy ? `(using proxy${useFallbackProxy ? ' - fallback' : ' - primary'})` : '(direct)');
                  
                  // If using primary proxy and fallback is available, try fallback
                  const hasFallback = !!process.env.NEXT_PUBLIC_FALLBACK_PROXY_URL;
                  if (useProxy && !useFallbackProxy && hasFallback) {
                    console.log('Trying fallback proxy server...');
                    setUseFallbackProxy(true);
                    // Don't show error yet, let fallback try
                  } else {
                    // Show error overlay after trying all options
                    setTimeout(() => {
                      setIframeBlocked(true);
                    }, 2000);
                  }
                }}
              />
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {position + 1}
                </div>
              )}
              {/* Streaming Site Options Dropdown - Always show button, just control opacity */}
              <div 
                data-streaming-options
                className={`absolute top-14 left-4 z-30 transition-opacity duration-200 ${showHoverLabels || showStreamingOptions ? 'opacity-100' : 'opacity-0'} ${!(showHoverLabels || showStreamingOptions) ? 'pointer-events-none' : ''}`}
              >
                  {showStreamingOptions ? (
                    <div className="bg-black/90 backdrop-blur-sm border border-zinc-700 rounded-lg shadow-lg overflow-hidden min-w-[180px] pointer-events-auto">
                      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
                        <span className="text-white text-xs font-semibold">Connection Options</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowStreamingOptions(false);
                          }}
                          className="text-zinc-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="py-1">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Close dropdown first to ensure it doesn't block the iframe
                            setShowStreamingOptions(false);
                            // Use setTimeout to ensure dropdown closes before iframe remounts
                            setTimeout(() => {
                              setUseProxy(true);
                              setIframeBlocked(false);
                            }, 50);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                            useProxy
                              ? 'bg-emerald-600 text-white'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Use Proxy</span>
                          {useProxy && (
                            <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Close dropdown first to ensure it doesn't block the iframe
                            setShowStreamingOptions(false);
                            // Use setTimeout to ensure dropdown closes before iframe remounts
                            setTimeout(() => {
                              setUseProxy(false);
                              setIframeBlocked(false);
                            }, 50);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                            !useProxy
                              ? 'bg-blue-600 text-white'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                          <span>Use Direct</span>
                          {!useProxy && (
                            <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStreamingOptions(true);
                        // Keep mobile labels visible when opening dropdown
                        if (isMobileDevice) {
                          triggerMobileLabels();
                        }
                      }}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all duration-200 shadow-lg flex items-center gap-1.5 pointer-events-auto flex-shrink-0 whitespace-nowrap ${
                        useProxy
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                      title="Connection options"
                    >
                      {useProxy ? (
                        <>
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="whitespace-nowrap">🔄 PROXIED</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                          <span className="whitespace-nowrap">🌐 STREAMING SITE</span>
                        </>
                      )}
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
              </div>
              
              {/* Streameast Server Selector and Proxy Toggle - Bottom Right */}
              {isStreameastUrl && (
                <div 
                  data-server-selector
                  className={`absolute bottom-4 right-4 z-30 transition-opacity duration-200 flex gap-2 ${showHoverLabels || showServerSelector ? 'opacity-100' : 'opacity-0'}`}
                >
                  {/* Server Selector - Only show if we have multiple servers */}
                  {streameastServers.length > 1 && (
                    showServerSelector ? (
                      <div className="bg-black/90 backdrop-blur-sm border border-zinc-700 rounded-lg shadow-lg overflow-hidden min-w-[200px] pointer-events-auto">
                        <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
                          <span className="text-white text-xs font-semibold">Select Server</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowServerSelector(false);
                            }}
                            className="text-zinc-400 hover:text-white transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto">
                          {streameastServers.map((server, index) => (
                            <button
                              key={index}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                // Prevent any navigation warnings by using a clean remount approach
                                setIsSwitchingServer(true);
                                
                                // Update server selection - React key change will force iframe remount
                                setSelectedStreameastServer(server.url);
                                setExtractedStream({
                                  url: server.url,
                                  type: 'iframe',
                                });
                                setShowServerSelector(false);
                                
                                // Reset iframe blocked state when switching servers
                                setIframeBlocked(false);
                                
                                // Clear switching state after a brief moment to allow iframe to start loading
                                setTimeout(() => {
                                  setIsSwitchingServer(false);
                                }, 500);
                              }}
                              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                                selectedStreameastServer === server.url
                                  ? 'bg-blue-600 text-white'
                                  : 'text-zinc-300 hover:bg-zinc-800'
                              }`}
                            >
                              {server.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowServerSelector(true);
                        }}
                        className="bg-black/80 hover:bg-black/90 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all duration-200 shadow-lg flex items-center gap-2 pointer-events-auto"
                        title="Switch server"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <span>
                          {selectedStreameastServer
                            ? streameastServers.find(s => s.url === selectedStreameastServer)?.name || 'Server'
                            : `Servers (${streameastServers.length})`}
                        </span>
                      </button>
                    )
                  )}
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
                  {position + 1}
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
                src={useProxy ? getProxyUrl(url, useFallbackProxy) : url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox={useProxy ? undefined : (isMobileDevice ? sandboxAttributes : undefined)}
                style={{ border: 'none', overflow: 'hidden' }}
                title={`Generic stream ${position + 1}`}
              />
              {showHoverLabels && (
                <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
                  {position + 1}
                </div>
              )}
              {/* Generic Streaming Options Dropdown - Always show button, just control opacity */}
              <div 
                data-streaming-options
                className={`absolute top-14 left-4 z-30 transition-opacity duration-200 ${showHoverLabels || showStreamingOptions ? 'opacity-100' : 'opacity-0'} ${!(showHoverLabels || showStreamingOptions) ? 'pointer-events-none' : ''}`}
              >
                  {showStreamingOptions ? (
                    <div className="bg-black/90 backdrop-blur-sm border border-zinc-700 rounded-lg shadow-lg overflow-hidden min-w-[180px] pointer-events-auto">
                      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
                        <span className="text-white text-xs font-semibold">Connection Options</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowStreamingOptions(false);
                          }}
                          className="text-zinc-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="py-1">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Close dropdown first to ensure it doesn't block the iframe
                            setShowStreamingOptions(false);
                            // Use setTimeout to ensure dropdown closes before iframe remounts
                            setTimeout(() => {
                              setUseProxy(true);
                              setIframeBlocked(false);
                            }, 50);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                            useProxy
                              ? 'bg-emerald-600 text-white'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Use Proxy</span>
                          {useProxy && (
                            <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Close dropdown first to ensure it doesn't block the iframe
                            setShowStreamingOptions(false);
                            // Use setTimeout to ensure dropdown closes before iframe remounts
                            setTimeout(() => {
                              setUseProxy(false);
                              setIframeBlocked(false);
                            }, 50);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                            !useProxy
                              ? 'bg-blue-600 text-white'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                          <span>Use Direct</span>
                          {!useProxy && (
                            <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStreamingOptions(true);
                        // Keep mobile labels visible when opening dropdown
                        if (isMobileDevice) {
                          triggerMobileLabels();
                        }
                      }}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all duration-200 shadow-lg flex items-center gap-1.5 pointer-events-auto flex-shrink-0 whitespace-nowrap ${
                        useProxy
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      title="Connection options"
                    >
                      {useProxy ? (
                        <>
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="whitespace-nowrap">🔄 PROXIED</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                          <span className="whitespace-nowrap">🌐 WEB PAGE</span>
                        </>
                      )}
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
              </div>
              {/* Mute indicator removed for generic iframes - mute control is inconsistent and not functional for iframes */}
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 overflow-hidden">
          {showHoverLabels && (
            <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-1.5 rounded text-sm font-bold pointer-events-none transition-opacity duration-200 z-20">
              {position + 1}
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
              className={`${confirmDelete ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white'} w-8 h-8 rounded-lg transition-all duration-200 shadow-lg pointer-events-auto flex items-center justify-center backdrop-blur-sm`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirmDelete) {
                  onRemove();
                  setConfirmDelete(false);
                } else {
                  setConfirmDelete(true);
                  // Reset confirmation after 3 seconds
                  if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
                  confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
                }
                handleInteraction();
              }}
              title={confirmDelete ? "Click again to confirm" : "Remove video"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Memoize VideoPlayer to prevent unnecessary re-renders when only position changes
// This is important for drag and drop - we want videos to stay mounted when slotOrder changes
export default React.memo(VideoPlayerComponent, (prevProps, nextProps) => {
  // Only re-render if URL, quadrantIndex, or other important props change
  // Ignore position changes as they don't affect the video content
  return (
    prevProps.url === nextProps.url &&
    prevProps.quadrantIndex === nextProps.quadrantIndex &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.isAudioEnabled === nextProps.isAudioEnabled &&
    prevProps.isDraggedOver === nextProps.isDraggedOver &&
    prevProps.isDragging === nextProps.isDragging
    // Note: We intentionally ignore position changes to prevent reloads during drag and drop
  );
});

