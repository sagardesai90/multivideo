import test from 'node:test';
import assert from 'node:assert/strict';

// Test the core drag-and-drop swap logic
// This mirrors the logic in VideoGrid.tsx handleDrop

interface VideoSlot {
    url: string;
    isExpanded: boolean;
}

function swapSlots(
    slots: VideoSlot[],
    sourceIndex: number,
    targetIndex: number
): VideoSlot[] {
    if (sourceIndex === targetIndex) {
        return slots;
    }

    if (sourceIndex < 0 || sourceIndex >= slots.length ||
        targetIndex < 0 || targetIndex >= slots.length) {
        return slots;
    }

    const newSlots = [...slots];
    const temp = newSlots[sourceIndex];
    newSlots[sourceIndex] = newSlots[targetIndex];
    newSlots[targetIndex] = temp;
    return newSlots;
}

function updateFocusedIndex(
    focusedIndex: number,
    sourceIndex: number,
    targetIndex: number
): number {
    if (focusedIndex === sourceIndex) {
        return targetIndex;
    } else if (focusedIndex === targetIndex) {
        return sourceIndex;
    }
    return focusedIndex;
}

test('swapSlots swaps two populated slots correctly', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: 'https://twitch.tv/channel', isExpanded: false },
        { url: '', isExpanded: false },
        { url: 'https://example.com/video.mp4', isExpanded: false },
    ];

    const result = swapSlots(slots, 0, 1);

    assert.equal(result[0].url, 'https://twitch.tv/channel');
    assert.equal(result[1].url, 'https://youtube.com/watch?v=abc');
    assert.equal(result[2].url, '');
    assert.equal(result[3].url, 'https://example.com/video.mp4');
});

test('swapSlots moves video to empty slot', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const result = swapSlots(slots, 0, 2);

    assert.equal(result[0].url, '');
    assert.equal(result[2].url, 'https://youtube.com/watch?v=abc');
});

test('swapSlots preserves expanded state during swap', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: true },
        { url: 'https://twitch.tv/channel', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const result = swapSlots(slots, 0, 1);

    assert.equal(result[0].isExpanded, false);
    assert.equal(result[1].isExpanded, true);
});

test('swapSlots returns same array when dropping on same slot', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const result = swapSlots(slots, 0, 0);

    assert.equal(result[0].url, 'https://youtube.com/watch?v=abc');
});

test('swapSlots handles invalid source index gracefully', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const result = swapSlots(slots, -1, 1);

    // Should return unchanged slots
    assert.equal(result[0].url, 'https://youtube.com/watch?v=abc');
    assert.equal(result[1].url, '');
});

test('swapSlots handles invalid target index gracefully', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    const result = swapSlots(slots, 0, 10);

    // Should return unchanged slots
    assert.equal(result[0].url, 'https://youtube.com/watch?v=abc');
    assert.equal(result[1].url, '');
});

test('updateFocusedIndex follows dragged video when focused', () => {
    const focusedIndex = 0;
    const sourceIndex = 0;
    const targetIndex = 2;

    const result = updateFocusedIndex(focusedIndex, sourceIndex, targetIndex);

    assert.equal(result, 2);
});

test('updateFocusedIndex swaps to source when target was focused', () => {
    const focusedIndex = 2;
    const sourceIndex = 0;
    const targetIndex = 2;

    const result = updateFocusedIndex(focusedIndex, sourceIndex, targetIndex);

    assert.equal(result, 0);
});

test('updateFocusedIndex remains unchanged when not involved in swap', () => {
    const focusedIndex = 3;
    const sourceIndex = 0;
    const targetIndex = 2;

    const result = updateFocusedIndex(focusedIndex, sourceIndex, targetIndex);

    assert.equal(result, 3);
});

test('swapSlots handles swapping between any two slots in larger grid', () => {
    const slots: VideoSlot[] = Array.from({ length: 9 }, (_, i) => ({
        url: i < 5 ? `https://video${i}.com` : '',
        isExpanded: false,
    }));

    // Swap slot 2 with slot 7 (empty)
    const result = swapSlots(slots, 2, 7);

    assert.equal(result[2].url, '');
    assert.equal(result[7].url, 'https://video2.com');
});

test('swapSlots does not mutate original array', () => {
    const slots: VideoSlot[] = [
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: 'https://twitch.tv/channel', isExpanded: false },
    ];

    const originalFirstUrl = slots[0].url;
    const result = swapSlots(slots, 0, 1);

    // Original array should be unchanged
    assert.equal(slots[0].url, originalFirstUrl);
    // Result should have swapped values
    assert.equal(result[0].url, 'https://twitch.tv/channel');
});

test('complete drag operation scenario - video with loading state', () => {
    // Simulates dragging a video that might be in loading/buffering state
    // The drag should work regardless of video playback state
    const slots: VideoSlot[] = [
        { url: 'https://stream.m3u8', isExpanded: false }, // HLS stream (could be loading)
        { url: '', isExpanded: false },
        { url: 'https://youtube.com/watch?v=abc', isExpanded: false },
        { url: '', isExpanded: false },
    ];

    // User drags the potentially loading HLS stream to slot 3
    const result = swapSlots(slots, 0, 3);

    assert.equal(result[0].url, '');
    assert.equal(result[3].url, 'https://stream.m3u8');
});

test('drag threshold logic - should not trigger for small movements', () => {
    const DRAG_THRESHOLD = 10;

    // Simulated mouse positions
    const startPos = { x: 100, y: 100 };
    const smallMove = { x: 105, y: 103 }; // 5px and 3px - under threshold
    const largeMove = { x: 115, y: 100 }; // 15px - over threshold

    const dx1 = Math.abs(smallMove.x - startPos.x);
    const dy1 = Math.abs(smallMove.y - startPos.y);
    const thresholdMet1 = dx1 > DRAG_THRESHOLD || dy1 > DRAG_THRESHOLD;

    const dx2 = Math.abs(largeMove.x - startPos.x);
    const dy2 = Math.abs(largeMove.y - startPos.y);
    const thresholdMet2 = dx2 > DRAG_THRESHOLD || dy2 > DRAG_THRESHOLD;

    assert.equal(thresholdMet1, false, 'Small movement should not meet threshold');
    assert.equal(thresholdMet2, true, 'Large movement should meet threshold');
});

// Helper that mirrors the updated handleMouseUp in VideoGrid.tsx
function simulateDragDropSwap({
    sourcePosition,
    targetPosition,
    numSlots,
    slotOrder,
    layoutMode,
    focusedIndex,
    videoSlots,
}: {
    sourcePosition: number;
    targetPosition: number;
    numSlots: number;
    slotOrder: number[];
    layoutMode: 'grid' | 'expanded' | 'split';
    focusedIndex: number;
    videoSlots: VideoSlot[];
}) {
    if (sourcePosition < 0 || sourcePosition >= numSlots || targetPosition < 0 || targetPosition >= numSlots) {
        return { slotOrder, focusedIndex, videoSlots };
    }
    if (sourcePosition === targetPosition) {
        return { slotOrder, focusedIndex, videoSlots };
    }

    const sourceSlot = slotOrder[sourcePosition];
    const targetSlot = slotOrder[targetPosition];

    const newOrder = [...slotOrder];
    const temp = newOrder[sourcePosition];
    newOrder[sourcePosition] = newOrder[targetPosition];
    newOrder[targetPosition] = temp;

    let newFocusedIndex = focusedIndex;
    let newVideoSlots = [...videoSlots];

    const anyExpanded = videoSlots.some((s) => s.isExpanded);
    const expandedIndex = videoSlots.findIndex((s) => s.isExpanded);

    if (layoutMode === 'split') {
        if (sourceSlot === focusedIndex) {
            newFocusedIndex = targetSlot;
        } else if (targetSlot === focusedIndex) {
            newFocusedIndex = sourceSlot;
        }
    } else if (layoutMode === 'expanded' || anyExpanded) {
        const isSourceFeatured = sourceSlot === expandedIndex || (layoutMode === 'expanded' && sourceSlot === focusedIndex);
        const isTargetFeatured = targetSlot === expandedIndex || (layoutMode === 'expanded' && targetSlot === focusedIndex);

        if (isSourceFeatured) {
            newVideoSlots = videoSlots.map((slot, i) => ({
                ...slot,
                isExpanded: i === targetSlot,
            }));
            newFocusedIndex = targetSlot;
        } else if (isTargetFeatured) {
            newVideoSlots = videoSlots.map((slot, i) => ({
                ...slot,
                isExpanded: i === sourceSlot,
            }));
            newFocusedIndex = sourceSlot;
        }
    }

    return {
        slotOrder: newOrder,
        focusedIndex: newFocusedIndex,
        videoSlots: newVideoSlots,
    };
}

test('split mode: dragging featured slot to secondary slot swaps slotOrder and updates focusedIndex', () => {
    const slotOrder = [0, 1, 2, 3];
    const focusedIndex = 0; // Slot 0 is featured at position 0
    const videoSlots: VideoSlot[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://test.com/video${i}`,
        isExpanded: false,
    }));

    // Drag position 0 (slot 0, featured) to position 1 (slot 1, secondary)
    const result = simulateDragDropSwap({
        sourcePosition: 0,
        targetPosition: 1,
        numSlots: 4,
        slotOrder,
        layoutMode: 'split',
        focusedIndex,
        videoSlots,
    });

    // slotOrder positions 0 and 1 are swapped
    assert.deepEqual(result.slotOrder, [1, 0, 2, 3]);
    // focusedIndex is updated to target slot (1) so slot 1 becomes featured!
    assert.equal(result.focusedIndex, 1);
});

test('split mode: dragging secondary slot onto featured slot swaps slotOrder and updates focusedIndex', () => {
    const slotOrder = [0, 1, 2, 3];
    const focusedIndex = 0; // Slot 0 is featured at position 0
    const videoSlots: VideoSlot[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://test.com/video${i}`,
        isExpanded: false,
    }));

    // Drag position 2 (slot 2, secondary) onto position 0 (slot 0, featured)
    const result = simulateDragDropSwap({
        sourcePosition: 2,
        targetPosition: 0,
        numSlots: 4,
        slotOrder,
        layoutMode: 'split',
        focusedIndex,
        videoSlots,
    });

    assert.deepEqual(result.slotOrder, [2, 1, 0, 3]);
    // focusedIndex is updated to source slot (2) so slot 2 becomes featured!
    assert.equal(result.focusedIndex, 2);
});

test('split mode: dragging between two secondary slots swaps positions while preserving focusedIndex', () => {
    const slotOrder = [0, 1, 2, 3];
    const focusedIndex = 0; // Slot 0 is featured
    const videoSlots: VideoSlot[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://test.com/video${i}`,
        isExpanded: false,
    }));

    // Drag position 1 (slot 1) to position 2 (slot 2)
    const result = simulateDragDropSwap({
        sourcePosition: 1,
        targetPosition: 2,
        numSlots: 4,
        slotOrder,
        layoutMode: 'split',
        focusedIndex,
        videoSlots,
    });

    assert.deepEqual(result.slotOrder, [0, 2, 1, 3]);
    // focusedIndex remains 0
    assert.equal(result.focusedIndex, 0);
});

test('expanded mode: dragging expanded slot to secondary slot updates slotOrder, isExpanded, and focusedIndex', () => {
    const slotOrder = [0, 1, 2, 3];
    const focusedIndex = 0;
    const videoSlots: VideoSlot[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://test.com/video${i}`,
        isExpanded: i === 0, // Slot 0 is expanded
    }));

    // Drag position 0 (slot 0, expanded) to position 2 (slot 2, secondary)
    const result = simulateDragDropSwap({
        sourcePosition: 0,
        targetPosition: 2,
        numSlots: 4,
        slotOrder,
        layoutMode: 'expanded',
        focusedIndex,
        videoSlots,
    });

    assert.deepEqual(result.slotOrder, [2, 1, 0, 3]);
    // focusedIndex updated to 2
    assert.equal(result.focusedIndex, 2);
    // Slot 2 is now expanded, Slot 0 is not
    assert.equal(result.videoSlots[2].isExpanded, true);
    assert.equal(result.videoSlots[0].isExpanded, false);
});

test('expanded mode: dragging secondary slot onto expanded slot updates slotOrder, isExpanded, and focusedIndex', () => {
    const slotOrder = [0, 1, 2, 3];
    const focusedIndex = 0;
    const videoSlots: VideoSlot[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://test.com/video${i}`,
        isExpanded: i === 0,
    }));

    // Drag position 1 (slot 1, secondary) to position 0 (slot 0, expanded)
    const result = simulateDragDropSwap({
        sourcePosition: 1,
        targetPosition: 0,
        numSlots: 4,
        slotOrder,
        layoutMode: 'expanded',
        focusedIndex,
        videoSlots,
    });

    assert.deepEqual(result.slotOrder, [1, 0, 2, 3]);
    assert.equal(result.focusedIndex, 1);
    assert.equal(result.videoSlots[1].isExpanded, true);
    assert.equal(result.videoSlots[0].isExpanded, false);
});

test('grid mode: dragging slots swaps slotOrder without altering focusedIndex or videoSlots', () => {
    const slotOrder = [0, 1, 2, 3];
    const focusedIndex = 0;
    const videoSlots: VideoSlot[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://test.com/video${i}`,
        isExpanded: false,
    }));

    const result = simulateDragDropSwap({
        sourcePosition: 0,
        targetPosition: 1,
        numSlots: 4,
        slotOrder,
        layoutMode: 'grid',
        focusedIndex,
        videoSlots,
    });

    assert.deepEqual(result.slotOrder, [1, 0, 2, 3]);
    assert.equal(result.focusedIndex, 0);
    assert.deepEqual(result.videoSlots, videoSlots);
});

