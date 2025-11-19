'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ShareData {
  numSlots: number;
  slotOrder: number[];
  videoUrls: { [key: string]: string };
}

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadShare() {
      const id = params.id as string;

      if (!id) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/share?id=${encodeURIComponent(id)}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Share link not found or expired');
          } else {
            setError('Failed to load share link');
          }
          setLoading(false);
          return;
        }

        const data: ShareData = await response.json();

        // Build URL params from the share data
        const urlParams = new URLSearchParams();
        urlParams.set('n', data.numSlots.toString());

        // Only include slotOrder if not default
        const defaultOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        const isDefaultOrder = data.slotOrder.every((val, idx) => val === defaultOrder[idx]);
        if (!isDefaultOrder) {
          urlParams.set('o', data.slotOrder.join(''));
        }

        // Add video URLs
        Object.entries(data.videoUrls).forEach(([index, url]) => {
          urlParams.set(index, url);
        });

        // Redirect to main page with the params
        router.replace(`/?${urlParams.toString()}`);
      } catch (err) {
        console.error('Failed to load share:', err);
        setError('Failed to load share link');
        setLoading(false);
      }
    }

    loadShare();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading shared view...</div>
      </div>
    );
  }

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

  return null;
}
