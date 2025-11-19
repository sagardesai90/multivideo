'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { decodeShareState } from '@/lib/urlCompression';

export default function CompressedSharePage() {
  const params = useParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const encoded = params.data as string;

    if (!encoded) {
      setError('Invalid share link');
      return;
    }

    // Decode the compressed data
    const state = decodeShareState(encoded);

    if (!state) {
      setError('Failed to decode share link');
      return;
    }

    // Build URL params from the decoded state
    const urlParams = new URLSearchParams();
    urlParams.set('n', state.numSlots.toString());

    // Only include slotOrder if not default
    const defaultOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const isDefaultOrder = state.slotOrder.every((val, idx) => val === defaultOrder[idx]);
    if (!isDefaultOrder) {
      urlParams.set('o', state.slotOrder.join(''));
    }

    // Add video URLs
    Object.entries(state.videoUrls).forEach(([index, url]) => {
      urlParams.set(index, url);
    });

    // Redirect to main page with the params
    router.replace(`/?${urlParams.toString()}`);
  }, [params.data, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="text-red-500 text-xl">{error}</div>
        <a
          href="/"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Go to home page
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-xl">Loading shared view...</div>
    </div>
  );
}
