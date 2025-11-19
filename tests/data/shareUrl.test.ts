import test from 'node:test';
import assert from 'node:assert/strict';

// Test the share URL generation and parsing logic
// This mirrors the logic in VideoInput.tsx (handleShare) and VideoGrid.tsx (URL parsing)

interface VideoSlot {
    url: string;
    isExpanded: boolean;
}

/**
 * Generates share URL parameters from video slots, numSlots, and slotOrder
 * Mirrors the logic in VideoInput.tsx handleShare (compact format)
 */
function generateShareParams(
    videoSlots: VideoSlot[],
    numSlots: number,
    slotOrder: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8]
): URLSearchParams {
    const params = new URLSearchParams();

    // Include numSlots as 'n'
    params.set('n', numSlots.toString());

    // Only include slotOrder if it differs from default
    const defaultOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const isDefaultOrder = slotOrder.every((val, idx) => val === defaultOrder[idx]);
    if (!isDefaultOrder) {
        // Compact format: join digits
        params.set('o', slotOrder.join(''));
    }

    // Include video URLs with short param names (just the index)
    videoSlots.forEach((slot, index) => {
        if (slot.url) {
            params.set(index.toString(), slot.url);
        }
    });

    return params;
}

/**
 * Parses share URL parameters to extract video slots, numSlots, and slotOrder
 * Mirrors the logic in VideoGrid.tsx useEffect URL parsing (supports both compact and legacy formats)
 */
function parseShareParams(
    params: URLSearchParams
): { videoSlots: VideoSlot[]; numSlots: number; slotOrder: number[] } {
    // Check for numSlots in URL params (support both 'n' and legacy 'numSlots')
    const urlNumSlots = params.get('n') || params.get('numSlots');
    let targetNumSlots = 4; // default
    if (urlNumSlots) {
        const parsed = parseInt(urlNumSlots, 10);
        if (parsed >= 1 && parsed <= 9) {
            targetNumSlots = parsed;
        }
    }

    // Always create full 9-slot array to preserve data
    const urlVideos: VideoSlot[] = Array.from({ length: 9 }, () => ({
        url: '',
        isExpanded: false,
    }));

    let hasUrlVideos = false;
    // Check all possible slots (0-8) for URL parameters
    // Support both new format (just index) and legacy format ('v0', 'v1')
    for (let i = 0; i < 9; i++) {
        const urlParam = params.get(i.toString()) || params.get(`v${i}`);
        if (urlParam) {
            urlVideos[i].url = urlParam;
            hasUrlVideos = true;
            // If we find a video at index i, ensure numSlots is at least i+1
            if (i + 1 > targetNumSlots) {
                targetNumSlots = i + 1;
            }
        }
    }

    // Parse slotOrder from URL if present
    // Support both compact format ('o') and legacy JSON format ('slotOrder')
    let slotOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const urlSlotOrderCompact = params.get('o');
    const urlSlotOrderLegacy = params.get('slotOrder');

    if (urlSlotOrderCompact) {
        // Compact format: "312045678"
        const parsed = urlSlotOrderCompact.split('').map(c => parseInt(c, 10));
        if (parsed.length >= 1 && parsed.every(n => !isNaN(n) && n >= 0 && n <= 8)) {
            slotOrder = normalizeSlotOrder(parsed);
        }
    } else if (urlSlotOrderLegacy) {
        // Legacy JSON format
        try {
            const parsed = JSON.parse(urlSlotOrderLegacy);
            if (Array.isArray(parsed) && parsed.length >= 1) {
                slotOrder = normalizeSlotOrder(parsed);
            }
        } catch {
            // Keep default slotOrder
        }
    }

    return {
        // Always return full 9 slots to preserve data
        videoSlots: hasUrlVideos ? urlVideos : [],
        numSlots: targetNumSlots,
        slotOrder,
    };
}

// Helper to normalize slotOrder to 9 elements
function normalizeSlotOrder(order: number[]): number[] {
    const result = order.slice(0, 9);
    const present = new Set(result);
    for (let i = 0; i < 9; i++) {
        if (!present.has(i)) {
            result.push(i);
        }
    }
    return result.slice(0, 9);
}

// ========== Share URL Generation Tests ==========

test('generateShareParams includes numSlots parameter', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const params = generateShareParams(slots, 4);

    assert.equal(params.get('n'), '4');
});

test('generateShareParams encodes all video URLs correctly', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: 'https://twitch.tv/channel', isExpanded: false },
        { url: '', isExpanded: false },
        { url: 'https://example.com/video.mp4', isExpanded: false },
    ];

    const params = generateShareParams(slots, 4);

    assert.equal(params.get('0'), 'https://youtube.com/watch?v=abc');
    assert.equal(params.get('1'), 'https://twitch.tv/channel');
    assert.equal(params.get('2'), null); // Empty slots should not be included
    assert.equal(params.get('3'), 'https://example.com/video.mp4');
});

test('generateShareParams handles more than 4 slots correctly', () => {
    const slots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => ({
        url: i % 2 === 0 ? `https://video${i}.com` : '',
        isExpanded: false,
    }));

    const params = generateShareParams(slots, 9);

    assert.equal(params.get('n'), '9');
    assert.equal(params.get('0'), 'https://video0.com');
    assert.equal(params.get('2'), 'https://video2.com');
    assert.equal(params.get('4'), 'https://video4.com');
    assert.equal(params.get('6'), 'https://video6.com');
    assert.equal(params.get('8'), 'https://video8.com');
    // Odd indices should not be included (empty slots)
    assert.equal(params.get('1'), null);
    assert.equal(params.get('3'), null);
});

test('generateShareParams handles 6 slots with all videos', () => {
    const slots: VideoSlot[] = Array.from({ length: 6 }, (_, i) => ({
        url: `https://video${i}.com`,
        isExpanded: false,
    }));

    const params = generateShareParams(slots, 6);

    assert.equal(params.get('n'), '6');
    for (let i = 0; i < 6; i++) {
        assert.equal(params.get(i.toString()), `https://video${i}.com`);
    }
});

test('generateShareParams handles empty grid', () => {
    const slots: VideoSlot[] = [
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const params = generateShareParams(slots, 2);

    assert.equal(params.get('n'), '2');
    assert.equal(params.get('0'), null);
    assert.equal(params.get('1'), null);
});

test('generateShareParams omits slotOrder when default', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
    ];

    // Default order should not include 'o' parameter
    const params = generateShareParams(slots, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8]);

    assert.equal(params.get('o'), null);
});

test('generateShareParams includes compact slotOrder when non-default', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
    ];

    // Non-default order should include compact 'o' parameter
    const params = generateShareParams(slots, 4, [3, 1, 2, 0, 4, 5, 6, 7, 8]);

    assert.equal(params.get('o'), '312045678');
});

// ========== Share URL Parsing Tests ==========

test('parseShareParams reads numSlots from URL', () => {
    const params = new URLSearchParams('numSlots=6&v0=https://video.com');

    const result = parseShareParams(params);

    assert.equal(result.numSlots, 6);
});

test('parseShareParams defaults numSlots to 4 when not specified', () => {
    const params = new URLSearchParams('v0=https://video.com');

    const result = parseShareParams(params);

    assert.equal(result.numSlots, 4);
});

test('parseShareParams reads all 9 video slots correctly', () => {
    const urlParts: string[] = [];
    for (let i = 0; i < 9; i++) {
        urlParts.push(`v${i}=https://video${i}.com`);
    }
    urlParts.push('numSlots=9');
    const params = new URLSearchParams(urlParts.join('&'));

    const result = parseShareParams(params);

    assert.equal(result.numSlots, 9);
    assert.equal(result.videoSlots.length, 9);
    for (let i = 0; i < 9; i++) {
        assert.equal(result.videoSlots[i].url, `https://video${i}.com`);
    }
});

test('parseShareParams auto-expands numSlots when video at higher index exists', () => {
    // User shares a URL with v8 but only numSlots=4
    // This could happen if someone manually edits the URL
    const params = new URLSearchParams('numSlots=4&v0=https://a.com&v8=https://b.com');

    const result = parseShareParams(params);

    // Should auto-expand to include slot 8
    assert.equal(result.numSlots, 9);
    assert.equal(result.videoSlots.length, 9);
    assert.equal(result.videoSlots[0].url, 'https://a.com');
    assert.equal(result.videoSlots[8].url, 'https://b.com');
});

test('parseShareParams handles sparse video slots', () => {
    const params = new URLSearchParams('numSlots=6&v0=https://a.com&v3=https://b.com&v5=https://c.com');

    const result = parseShareParams(params);

    assert.equal(result.numSlots, 6);
    assert.equal(result.videoSlots[0].url, 'https://a.com');
    assert.equal(result.videoSlots[1].url, '');
    assert.equal(result.videoSlots[2].url, '');
    assert.equal(result.videoSlots[3].url, 'https://b.com');
    assert.equal(result.videoSlots[4].url, '');
    assert.equal(result.videoSlots[5].url, 'https://c.com');
});

test('parseShareParams clamps invalid numSlots to valid range', () => {
    const tooLarge = new URLSearchParams('numSlots=15&v0=https://video.com');
    const tooSmall = new URLSearchParams('numSlots=0&v0=https://video.com');

    const resultLarge = parseShareParams(tooLarge);
    const resultSmall = parseShareParams(tooSmall);

    // Invalid values should fall back to default 4, but auto-expand based on videos
    assert.equal(resultLarge.numSlots, 4); // Falls back to default
    assert.equal(resultSmall.numSlots, 4); // Falls back to default
});

test('parseShareParams returns empty array when no videos in URL', () => {
    const params = new URLSearchParams('numSlots=4');

    const result = parseShareParams(params);

    assert.equal(result.videoSlots.length, 0);
    assert.equal(result.numSlots, 4);
});

// ========== Round-trip Tests ==========

test('share params survive round-trip for 4 slots', () => {
    // Always use 9 slots internally, numSlots controls visibility
    const originalSlots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => {
        if (i === 0) return { url: 'https://youtube.com/watch?v=abc', isExpanded: false };
        if (i === 1) return { url: 'https://twitch.tv/channel', isExpanded: false };
        if (i === 3) return { url: 'https://example.com/video.mp4', isExpanded: false };
        return { url: '', isExpanded: false };
    });
    const originalNumSlots = 4;

    const params = generateShareParams(originalSlots, originalNumSlots);
    const parsed = parseShareParams(params);

    assert.equal(parsed.numSlots, originalNumSlots);
    assert.equal(parsed.videoSlots.length, 9); // Always 9 slots
    assert.equal(parsed.videoSlots[0].url, originalSlots[0].url);
    assert.equal(parsed.videoSlots[1].url, originalSlots[1].url);
    assert.equal(parsed.videoSlots[2].url, '');
    assert.equal(parsed.videoSlots[3].url, originalSlots[3].url);
});

test('share params survive round-trip for 9 slots', () => {
    const originalSlots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => ({
        url: `https://video${i}.com`,
        isExpanded: false,
    }));
    const originalNumSlots = 9;

    const params = generateShareParams(originalSlots, originalNumSlots);
    const parsed = parseShareParams(params);

    assert.equal(parsed.numSlots, originalNumSlots);
    assert.equal(parsed.videoSlots.length, 9);
    for (let i = 0; i < 9; i++) {
        assert.equal(parsed.videoSlots[i].url, originalSlots[i].url);
    }
});

test('share params survive round-trip for 6 slots with sparse videos', () => {
    const originalSlots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => {
        if (i === 0) return { url: 'https://a.com', isExpanded: false };
        if (i === 2) return { url: 'https://b.com', isExpanded: false };
        if (i === 5) return { url: 'https://c.com', isExpanded: false };
        return { url: '', isExpanded: false };
    });
    const originalNumSlots = 6;

    const params = generateShareParams(originalSlots, originalNumSlots);
    const parsed = parseShareParams(params);

    assert.equal(parsed.numSlots, originalNumSlots);
    assert.equal(parsed.videoSlots.length, 9); // Always 9 slots
    assert.equal(parsed.videoSlots[0].url, 'https://a.com');
    assert.equal(parsed.videoSlots[1].url, '');
    assert.equal(parsed.videoSlots[2].url, 'https://b.com');
    assert.equal(parsed.videoSlots[3].url, '');
    assert.equal(parsed.videoSlots[4].url, '');
    assert.equal(parsed.videoSlots[5].url, 'https://c.com');
});

test('share URL handles special characters in video URLs', () => {
    const slots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => {
        if (i === 0) return { url: 'https://youtube.com/watch?v=abc&t=120', isExpanded: false };
        if (i === 1) return { url: 'https://example.com/video?name=test%20video', isExpanded: false };
        return { url: '', isExpanded: false };
    });

    const params = generateShareParams(slots, 2);
    const parsed = parseShareParams(params);

    // URLSearchParams should handle encoding/decoding automatically
    assert.equal(parsed.videoSlots[0].url, 'https://youtube.com/watch?v=abc&t=120');
    assert.equal(parsed.videoSlots[1].url, 'https://example.com/video?name=test%20video');
});

// ========== Slot Order Tests ==========

test('generateShareParams includes compact slotOrder', () => {
    const slots: VideoSlot[] = Array.from({ length: 9 }, () => ({ url: '', isExpanded: false }));
    const customOrder = [2, 0, 1, 3, 4, 5, 6, 7, 8];

    const params = generateShareParams(slots, 4, customOrder);

    // New compact format: digits joined
    assert.equal(params.get('o'), '201345678');
});

test('parseShareParams extracts compact slotOrder from URL', () => {
    const customOrder = [1, 0, 3, 2, 4, 5, 6, 7, 8];
    // New compact format
    const params = new URLSearchParams('n=4&o=103245678&0=https://a.com');

    const result = parseShareParams(params);

    assert.deepEqual(result.slotOrder, customOrder);
});

test('parseShareParams extracts legacy JSON slotOrder from URL', () => {
    const customOrder = [1, 0, 3, 2, 4, 5, 6, 7, 8];
    // Legacy JSON format for backward compatibility
    const params = new URLSearchParams(`numSlots=4&slotOrder=${JSON.stringify(customOrder)}&v0=https://a.com`);

    const result = parseShareParams(params);

    assert.deepEqual(result.slotOrder, customOrder);
});

test('slotOrder survives round-trip', () => {
    const slots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => ({
        url: i < 4 ? `https://video${i}.com` : '',
        isExpanded: false,
    }));
    const customOrder = [3, 2, 1, 0, 4, 5, 6, 7, 8]; // Reversed first 4

    const params = generateShareParams(slots, 4, customOrder);
    const parsed = parseShareParams(params);

    assert.deepEqual(parsed.slotOrder, customOrder);
    assert.equal(parsed.numSlots, 4);
    assert.equal(parsed.videoSlots[0].url, 'https://video0.com');
    assert.equal(parsed.videoSlots[3].url, 'https://video3.com');
});

// ========== Edge Case Tests ==========

test('parseShareParams handles single slot grid', () => {
    const params = new URLSearchParams('numSlots=1&v0=https://solo.com');

    const result = parseShareParams(params);

    assert.equal(result.numSlots, 1);
    assert.equal(result.videoSlots.length, 9); // Always 9 slots
    assert.equal(result.videoSlots[0].url, 'https://solo.com');
});

test('generateShareParams handles single slot grid', () => {
    const slots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => ({
        url: i === 0 ? 'https://solo.com' : '',
        isExpanded: false,
    }));

    const params = generateShareParams(slots, 1);

    assert.equal(params.get('n'), '1');
    assert.equal(params.get('0'), 'https://solo.com');
});

test('parseShareParams defaults slotOrder when not in URL', () => {
    const params = new URLSearchParams('numSlots=4&v0=https://a.com');

    const result = parseShareParams(params);

    assert.deepEqual(result.slotOrder, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('parseShareParams ignores invalid slotOrder', () => {
    // Invalid: not an array
    const params1 = new URLSearchParams('numSlots=4&slotOrder=invalid&v0=https://a.com');
    const result1 = parseShareParams(params1);
    assert.deepEqual(result1.slotOrder, [0, 1, 2, 3, 4, 5, 6, 7, 8]);

    // Empty array should be ignored
    const params2 = new URLSearchParams('numSlots=4&slotOrder=[]&v0=https://a.com');
    const result2 = parseShareParams(params2);
    assert.deepEqual(result2.slotOrder, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('parseShareParams normalizes short slotOrder arrays', () => {
    // Short array should be normalized to 9 elements
    const params = new URLSearchParams('numSlots=4&slotOrder=[3,1,2]&v0=https://a.com');
    const result = parseShareParams(params);
    // [3,1,2] normalized: starts with [3,1,2], then adds missing 0,4,5,6,7,8
    assert.deepEqual(result.slotOrder, [3, 1, 2, 0, 4, 5, 6, 7, 8]);
});
