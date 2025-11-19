import test from 'node:test';
import assert from 'node:assert/strict';

// Test the client-side URL compression (mirrors lib/urlCompression.ts)

interface ShareState {
  numSlots: number;
  slotOrder: number[];
  videoUrls: { [key: string]: string };
}

// Base64url encoding/decoding (mirrors lib/urlCompression.ts)
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = Buffer.from(binary, 'binary').toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Encode share state (mirrors lib/urlCompression.ts)
function encodeShareState(state: ShareState): string {
  const parts: number[] = [];
  parts.push(state.numSlots);
  for (let i = 0; i < 9; i++) {
    parts.push(state.slotOrder[i] ?? i);
  }
  const encoder = new TextEncoder();
  Object.entries(state.videoUrls).forEach(([indexStr, url]) => {
    if (!url) return;
    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 0 || index > 8) return;
    const urlBytes = encoder.encode(url);
    if (urlBytes.length > 65535) return;
    parts.push(index);
    parts.push((urlBytes.length >> 8) & 0xFF);
    parts.push(urlBytes.length & 0xFF);
    for (let i = 0; i < urlBytes.length; i++) {
      parts.push(urlBytes[i]);
    }
  });
  parts.push(0xFF);
  const bytes = new Uint8Array(parts);
  return uint8ArrayToBase64Url(bytes);
}

// Decode share state (mirrors lib/urlCompression.ts)
function decodeShareState(encoded: string): ShareState | null {
  try {
    const bytes = base64UrlToUint8Array(encoded);
    if (bytes.length < 11) return null;
    let offset = 0;
    const numSlots = bytes[offset++];
    if (numSlots < 1 || numSlots > 9) return null;
    const slotOrder: number[] = [];
    for (let i = 0; i < 9; i++) {
      const val = bytes[offset++];
      if (val > 8) return null;
      slotOrder.push(val);
    }
    const videoUrls: { [key: string]: string } = {};
    const decoder = new TextDecoder();
    while (offset < bytes.length) {
      const marker = bytes[offset++];
      if (marker === 0xFF) break;
      if (marker > 8) return null;
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
  } catch {
    return null;
  }
}

// Validate share data structure
function isValidShareState(data: unknown): data is ShareState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.numSlots !== 'number' || obj.numSlots < 1 || obj.numSlots > 9) {
    return false;
  }
  if (!Array.isArray(obj.slotOrder) || obj.slotOrder.length !== 9) {
    return false;
  }
  if (typeof obj.videoUrls !== 'object' || obj.videoUrls === null) {
    return false;
  }
  return true;
}

// ========== Encoding/Decoding Round-Trip Tests ==========

test('encode/decode round-trip preserves simple state', () => {
  const state: ShareState = {
    numSlots: 4,
    slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    videoUrls: { '0': 'https://youtube.com/watch?v=abc' },
  };

  const encoded = encodeShareState(state);
  const decoded = decodeShareState(encoded);

  assert.ok(decoded);
  assert.equal(decoded.numSlots, state.numSlots);
  assert.deepEqual(decoded.slotOrder, state.slotOrder);
  assert.deepEqual(decoded.videoUrls, state.videoUrls);
});

test('encode/decode round-trip preserves complex state', () => {
  const state: ShareState = {
    numSlots: 9,
    slotOrder: [8, 7, 6, 5, 4, 3, 2, 1, 0], // Reversed
    videoUrls: {
      '0': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '2': 'https://www.twitch.tv/shroud',
      '5': 'https://kick.com/xqc',
      '8': 'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=120',
    },
  };

  const encoded = encodeShareState(state);
  const decoded = decodeShareState(encoded);

  assert.ok(decoded);
  assert.equal(decoded.numSlots, state.numSlots);
  assert.deepEqual(decoded.slotOrder, state.slotOrder);
  assert.deepEqual(decoded.videoUrls, state.videoUrls);
});

test('encode/decode preserves empty videoUrls', () => {
  const state: ShareState = {
    numSlots: 6,
    slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    videoUrls: {},
  };

  const encoded = encodeShareState(state);
  const decoded = decodeShareState(encoded);

  assert.ok(decoded);
  assert.equal(decoded.numSlots, 6);
  assert.deepEqual(decoded.videoUrls, {});
});

test('encode/decode preserves special characters in URLs', () => {
  const state: ShareState = {
    numSlots: 2,
    slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    videoUrls: {
      '0': 'https://example.com/video?a=1&b=2&name=test%20video',
      '1': 'https://example.com/path/with spaces/and=equals',
    },
  };

  const encoded = encodeShareState(state);
  const decoded = decodeShareState(encoded);

  assert.ok(decoded);
  assert.deepEqual(decoded.videoUrls, state.videoUrls);
});

// ========== Share State Validation Tests ==========

test('isValidShareState accepts valid data', () => {
  const valid: ShareState = {
    numSlots: 6,
    slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    videoUrls: { '0': 'https://youtube.com/watch?v=abc' },
  };
  assert.equal(isValidShareState(valid), true);
});

test('isValidShareState rejects invalid numSlots', () => {
  assert.equal(isValidShareState({ numSlots: 0, slotOrder: [0,1,2,3,4,5,6,7,8], videoUrls: {} }), false);
  assert.equal(isValidShareState({ numSlots: 10, slotOrder: [0,1,2,3,4,5,6,7,8], videoUrls: {} }), false);
  assert.equal(isValidShareState({ numSlots: 'six', slotOrder: [0,1,2,3,4,5,6,7,8], videoUrls: {} }), false);
});

test('isValidShareState rejects invalid slotOrder', () => {
  assert.equal(isValidShareState({ numSlots: 4, slotOrder: [0,1,2], videoUrls: {} }), false);
  assert.equal(isValidShareState({ numSlots: 4, slotOrder: 'not an array', videoUrls: {} }), false);
});

test('isValidShareState rejects invalid videoUrls', () => {
  assert.equal(isValidShareState({ numSlots: 4, slotOrder: [0,1,2,3,4,5,6,7,8], videoUrls: 'not an object' }), false);
  assert.equal(isValidShareState({ numSlots: 4, slotOrder: [0,1,2,3,4,5,6,7,8], videoUrls: null }), false);
});

// ========== Decoding Error Handling Tests ==========

test('decodeShareState returns null for invalid base64', () => {
  assert.equal(decodeShareState('not-valid-base64!!!'), null);
});

test('decodeShareState returns null for too-short data', () => {
  // Less than 11 bytes (1 numSlots + 9 slotOrder + 1 end marker)
  const shortData = uint8ArrayToBase64Url(new Uint8Array([4, 0, 1, 2]));
  assert.equal(decodeShareState(shortData), null);
});

test('decodeShareState returns null for invalid numSlots', () => {
  const bytes = new Uint8Array([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0xFF]); // numSlots = 0
  const encoded = uint8ArrayToBase64Url(bytes);
  assert.equal(decodeShareState(encoded), null);
});

// ========== URL Characteristics Tests ==========

test('compressed URL is URL-safe (no special characters need escaping)', () => {
  const state: ShareState = {
    numSlots: 4,
    slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    videoUrls: {
      '0': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120',
      '1': 'https://www.twitch.tv/shroud?ref=test',
    },
  };

  const encoded = encodeShareState(state);

  // Base64url should only contain alphanumeric, dash, and underscore
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);

  // No URL encoding needed for the path
  assert.equal(encoded, encodeURIComponent(encoded));
});

test('compressed URL works with complex URLs containing special chars', () => {
  const state: ShareState = {
    numSlots: 2,
    slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    videoUrls: {
      '0': 'https://example.com/path?a=1&b=2&c=hello%20world',
      '1': 'https://example.com/video#timestamp=120',
    },
  };

  const encoded = encodeShareState(state);
  const decoded = decodeShareState(encoded);

  assert.ok(decoded);
  assert.deepEqual(decoded.videoUrls, state.videoUrls);
});

test('compressed URL length scales linearly with video URLs', () => {
  const lengths: number[] = [];

  for (let numVideos = 1; numVideos <= 9; numVideos++) {
    const state: ShareState = {
      numSlots: numVideos,
      slotOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      videoUrls: {},
    };

    for (let i = 0; i < numVideos; i++) {
      state.videoUrls[i.toString()] = `https://youtube.com/watch?v=${'x'.repeat(11)}`;
    }

    const encoded = encodeShareState(state);
    lengths.push(encoded.length);
  }

  // Each additional video should add roughly the same amount
  // (URL length + 3 bytes overhead for index and length)
  for (let i = 1; i < lengths.length; i++) {
    const increase = lengths[i] - lengths[i - 1];
    // Should increase by ~50-60 chars per video (base64 of ~40 byte URL)
    assert.ok(increase > 30 && increase < 80, `Increase from ${i} to ${i+1} videos: ${increase}`);
  }
});
