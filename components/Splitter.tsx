'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface SplitterProps {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
  className?: string;
}

export default function Splitter({ direction, onDrag, className = '' }: SplitterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === 'horizontal' 
        ? e.clientY - startPosRef.current.y
        : e.clientX - startPosRef.current.x;
      
      onDrag(delta);
      startPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, onDrag]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        ${isHorizontal ? 'h-1 w-full cursor-row-resize' : 'w-1 h-full cursor-col-resize'}
        ${isDragging ? 'bg-green-500' : 'bg-zinc-800 hover:bg-green-600'}
        transition-colors
        ${className}
      `}
      style={{
        userSelect: 'none',
        touchAction: 'none',
      }}
    />
  );
}

