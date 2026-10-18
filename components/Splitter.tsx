'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SplitterProps {
  direction: 'horizontal' | 'vertical';
  // Element the split percentage is measured against
  containerRef: React.RefObject<HTMLElement | null>;
  min: number;
  max: number;
  onChange: (percent: number) => void;
  className?: string;
}

export default function Splitter({ direction, containerRef, min, max, onChange, className = '' }: SplitterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const onChangeRef = useRef(onChange);
  const stopDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // End any in-progress drag if the splitter unmounts mid-drag
  useEffect(() => () => stopDragRef.current?.(), []);

  const isHorizontal = direction === 'horizontal';
  const cursor = isHorizontal ? 'row-resize' : 'col-resize';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    const containerRect = container.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    // Keep the grabbed point under the cursor instead of snapping the line's center to it
    const grabOffset = isHorizontal
      ? e.clientY - (handleRect.top + handleRect.height / 2)
      : e.clientX - (handleRect.left + handleRect.width / 2);

    // Pointer capture keeps events flowing to us while the cursor is over a video iframe,
    // which would otherwise swallow them and stall the drag
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // The full-screen overlay below still covers iframes if capture isn't available
    }

    let frame = 0;
    let pendingPercent: number | null = null;

    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      // Button was released somewhere we never heard about (e.g. outside the window)
      if (ev.pointerType === 'mouse' && ev.buttons === 0) {
        stop();
        return;
      }
      const offset = isHorizontal
        ? ev.clientY - grabOffset - containerRect.top
        : ev.clientX - grabOffset - containerRect.left;
      const size = isHorizontal ? containerRect.height : containerRect.width;
      if (size <= 0) return;
      pendingPercent = Math.max(min, Math.min(max, (offset / size) * 100));
      // Coalesce to one layout update per frame so dragging stays smooth with many players
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pendingPercent !== null) onChangeRef.current(pendingPercent);
        });
      }
    };

    const handleUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) stop();
    };

    const previousUserSelect = document.body.style.userSelect;

    const stop = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      if (frame) cancelAnimationFrame(frame);
      if (pendingPercent !== null) onChangeRef.current(pendingPercent);
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        // Element may already be detached
      }
      document.body.style.userSelect = previousUserSelect;
      stopDragRef.current = null;
      setIsDragging(false);
    };

    stopDragRef.current?.();
    stopDragRef.current = stop;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    document.body.style.userSelect = 'none';
    setIsDragging(true);
  };

  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        className={`
          group/splitter flex items-center justify-center
          ${isHorizontal ? 'h-2 w-full' : 'w-2 h-full'}
          ${className}
        `}
        style={{ cursor, userSelect: 'none', touchAction: 'none' }}
      >
        <div
          className={`
            ${isHorizontal ? 'h-1 w-full' : 'w-1 h-full'}
            ${isDragging ? 'bg-green-500' : 'bg-zinc-800 group-hover/splitter:bg-green-600'}
            transition-colors pointer-events-none
          `}
        />
      </div>
      {/* While dragging, cover the page so video iframes can't intercept the pointer */}
      {isDragging &&
        createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, cursor, touchAction: 'none' }} />,
          document.body
        )}
    </>
  );
}
