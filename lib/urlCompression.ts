/**
 * Client-side URL compression for share links
 *
 * Uses a compact binary format + base64url encoding to minimize URL length.
 * No server required - all data is encoded directly in the URL.
 *
 * Format: /c/{base64url-encoded-data}
 *
 * The data structure is:
 * - 1 byte: numSlots (1-9)
 * - 9 bytes: slotOrder (one byte per slot, values 0-8)
 * - For each video URL:
 *   - 1 byte: slot index
 *   - 2 bytes: URL length (big-endian)
 *   - N bytes: URL string (UTF-8)
 * - 1 byte: 0xFF (end marker)
 */

export interface ShareState {
  numSlots: number;
  slotOrder: number[];
  videoUrls: { [key: string]: string };
}

/**
 * Encode share state to a compact base64url string
 */
export function encodeShareState(state: ShareState): string {
  const parts: number[] = [];

  // 1 byte: numSlots
  parts.push(state.numSlots);

  // 9 bytes: slotOrder
  for (let i = 0; i < 9; i++) {
    parts.push(state.slotOrder[i] ?? i);
  }

  // Video URLs
  const encoder = new TextEncoder();
  Object.entries(state.videoUrls).forEach(([indexStr, url]) => {
    if (!url) return;

    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 0 || index > 8) return;

    const urlBytes = encoder.encode(url);
    if (urlBytes.length > 65535) return; // URL too long

    // 1 byte: slot index
    parts.push(index);

    // 2 bytes: URL length (big-endian)
    parts.push((urlBytes.length >> 8) & 0xFF);
    parts.push(urlBytes.length & 0xFF);

    // URL bytes
    for (let i = 0; i < urlBytes.length; i++) {
      parts.push(urlBytes[i]);
    }
  });

  // End marker
  parts.push(0xFF);

  // Convert to Uint8Array and base64url encode
  const bytes = new Uint8Array(parts);
  return uint8ArrayToBase64Url(bytes);
}

/**
 * Decode a base64url string back to share state
 */
export function decodeShareState(encoded: string): ShareState | null {
  try {
    const bytes = base64UrlToUint8Array(encoded);
    if (bytes.length < 11) return null; // Minimum: 1 + 9 + 1 (numSlots + slotOrder + end marker)

    let offset = 0;

    // 1 byte: numSlots
    const numSlots = bytes[offset++];
    if (numSlots < 1 || numSlots > 9) return null;

    // 9 bytes: slotOrder
    const slotOrder: number[] = [];
    for (let i = 0; i < 9; i++) {
      const val = bytes[offset++];
      if (val > 8) return null;
      slotOrder.push(val);
    }

    // Video URLs
    const videoUrls: { [key: string]: string } = {};
    const decoder = new TextDecoder();

    while (offset < bytes.length) {
      const marker = bytes[offset++];
      if (marker === 0xFF) break; // End marker

      if (marker > 8) return null; // Invalid slot index

      if (offset + 2 > bytes.length) return null;
      const urlLength = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;

      if (offset + urlLength > bytes.length) return null;
      const urlBytes = bytes.slice(offset, offset + urlLength);
      offset += urlLength;

      const url = decoder.decode(urlBytes);
      videoUrls[marker.toString()] = url;
    }

    return { numSlots, slotOrder, videoUrls };
  } catch (e) {
    console.error('Failed to decode share state:', e);
    return null;
  }
}

/**
 * Convert Uint8Array to base64url string (URL-safe base64)
 */
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  // Convert to regular base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Convert to base64url (URL-safe)
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, ''); // Remove padding
}

/**
 * Convert base64url string back to Uint8Array
 */
function base64UrlToUint8Array(base64url: string): Uint8Array {
  // Convert from base64url to regular base64
  let base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  // Decode base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

/**
 * Check if a path is a compressed share URL
 */
export function isCompressedShareUrl(path: string): boolean {
  return path.startsWith('/c/');
}

/**
 * Extract the encoded data from a compressed share URL path
 */
export function getEncodedDataFromPath(path: string): string | null {
  if (!path.startsWith('/c/')) return null;
  return path.slice(3); // Remove '/c/'
}
