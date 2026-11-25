'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseWakeLockOptions {
  hasActiveVideos?: boolean;
}

export interface UseWakeLockReturn {
  isSupported: boolean;
  isActive: boolean;
  isEnabled: boolean;
  toggleKeepAwake: () => void;
  requestWakeLock: () => Promise<boolean>;
  releaseWakeLock: () => Promise<void>;
}

export function useWakeLock({ hasActiveVideos = false }: UseWakeLockOptions = {}): UseWakeLockReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const isRequestingRef = useRef(false);

  // Check support and load saved user preference
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'wakeLock' in navigator;
    setIsSupported(supported);

    const savedPreference = localStorage.getItem('streamatrix_keep_awake');
    if (savedPreference !== null) {
      setIsEnabled(savedPreference === 'true');
    }
  }, []);

  // Cleanup fallback video element
  const cleanupFallbackVideo = useCallback(() => {
    if (fallbackVideoRef.current) {
      try {
        fallbackVideoRef.current.pause();
        if (fallbackVideoRef.current.srcObject) {
          const stream = fallbackVideoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          fallbackVideoRef.current.srcObject = null;
        }
        if (fallbackVideoRef.current.parentNode) {
          fallbackVideoRef.current.parentNode.removeChild(fallbackVideoRef.current);
        }
      } catch {
        // Silently ignore cleanup errors
      }
      fallbackVideoRef.current = null;
    }
  }, []);

  // Release wake lock (both native and fallback)
  const releaseWakeLock = useCallback(async () => {
    if (sentinelRef.current) {
      try {
        const sentinel = sentinelRef.current;
        sentinelRef.current = null;
        await sentinel.release();
      } catch {
        // Ignore release errors
      }
    }
    cleanupFallbackVideo();
    setIsActive(false);
  }, [cleanupFallbackVideo]);

  // Request wake lock
  const requestWakeLock = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    if (!isEnabled || !hasActiveVideos) return false;

    // Already active with a valid sentinel
    if (sentinelRef.current && !sentinelRef.current.released) {
      setIsActive(true);
      return true;
    }

    if (isRequestingRef.current) return false;
    isRequestingRef.current = true;

    try {
      // 1. Try native Screen Wake Lock API (iOS 16.4+, Chrome, Safari, Edge)
      if ('wakeLock' in navigator) {
        const sentinel = await navigator.wakeLock.request('screen');
        sentinelRef.current = sentinel;
        setIsActive(true);

        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setIsActive(false);
          }
        });

        isRequestingRef.current = false;
        return true;
      }

      // 2. Fallback for older iOS / browsers without native Wake Lock API
      // Play a tiny, invisible 1x1 looping canvas stream to prevent display sleep
      if (!fallbackVideoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 1, 1);
        }

        if ('captureStream' in canvas && typeof canvas.captureStream === 'function') {
          const video = document.createElement('video');
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
          video.setAttribute('loop', '');
          video.muted = true;
          video.style.position = 'fixed';
          video.style.top = '-9999px';
          video.style.left = '-9999px';
          video.style.width = '1px';
          video.style.height = '1px';
          video.style.opacity = '0.001';
          video.style.pointerEvents = 'none';

          const stream = canvas.captureStream(1);
          video.srcObject = stream;
          document.body.appendChild(video);
          fallbackVideoRef.current = video;

          await video.play();
          setIsActive(true);
          isRequestingRef.current = false;
          return true;
        }
      } else if (fallbackVideoRef.current.paused) {
        await fallbackVideoRef.current.play();
        setIsActive(true);
        isRequestingRef.current = false;
        return true;
      }
    } catch {
      // NotAllowedError is expected on iOS Safari if invoked without transient user activation
      // or if Low Power Mode is on. It will be retried on next user touch.
      sentinelRef.current = null;
      setIsActive(false);
    } finally {
      isRequestingRef.current = false;
    }

    return false;
  }, [isEnabled, hasActiveVideos]);

  // Toggle user preference
  const toggleKeepAwake = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('streamatrix_keep_awake', String(next));
      } catch {
        // Ignore localStorage errors
      }

      if (!next) {
        releaseWakeLock();
      } else if (hasActiveVideos) {
        // Since toggle is triggered by a direct user click/tap, this satisfies
        // iOS Safari's user gesture requirement immediately!
        requestWakeLock();
      }

      return next;
    });
  }, [hasActiveVideos, releaseWakeLock, requestWakeLock]);

  // Auto-manage wake lock state based on hasActiveVideos & user interactions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isEnabled || !hasActiveVideos) {
      releaseWakeLock();
      return;
    }

    // Try requesting immediately (works on desktop / Android or if during a user action)
    requestWakeLock().catch(() => {});

    // On iOS Safari, wakeLock requires a transient user gesture (touch / pointer / click).
    // Attach passive listeners so that any tap/touch on the page automatically acquires
    // the wake lock without prompting the user or breaking playback.
    const handleUserInteraction = () => {
      if (isEnabled && hasActiveVideos && (!sentinelRef.current || sentinelRef.current.released)) {
        requestWakeLock().catch(() => {});
      }
    };

    const interactionEvents = ['pointerdown', 'touchstart', 'click', 'keydown'] as const;
    interactionEvents.forEach((event) => {
      window.addEventListener(event, handleUserInteraction, { passive: true });
    });

    // Handle visibility changes (e.g., user minimizes Safari, locks screen, or switches tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isEnabled && hasActiveVideos) {
        // Try immediately in case the browser allows re-acquisition on visibility
        requestWakeLock().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      interactionEvents.forEach((event) => {
        window.removeEventListener(event, handleUserInteraction);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isEnabled, hasActiveVideos, requestWakeLock, releaseWakeLock]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  return {
    isSupported,
    isActive,
    isEnabled,
    toggleKeepAwake,
    requestWakeLock,
    releaseWakeLock,
  };
}
