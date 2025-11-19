import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORAGE_FILE = join(process.cwd(), '.share-storage.json');

// Configuration (can be overridden via query params)
const DEFAULT_MAX_AGE_DAYS = 30; // Remove entries older than 30 days
const DEFAULT_MAX_INACTIVE_DAYS = 7; // Remove entries not accessed in 7 days

interface ShareData {
  numSlots: number;
  slotOrder: number[];
  videoUrls: { [key: string]: string };
  createdAt: number;
  lastAccessedAt: number;
}

interface StorageData {
  [id: string]: ShareData;
}

interface CleanupResult {
  totalBefore: number;
  totalAfter: number;
  removed: number;
  removedIds: string[];
  reasons: { [id: string]: string };
}

function loadStorage(): StorageData {
  try {
    if (existsSync(STORAGE_FILE)) {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[Cleanup] Failed to load share storage:', e);
  }
  return {};
}

function saveStorage(data: StorageData): void {
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[Cleanup] Failed to save share storage:', e);
    throw e;
  }
}

// POST: Run cleanup (use POST to prevent accidental triggering)
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse configuration from query params
    const maxAgeDays = parseInt(searchParams.get('maxAgeDays') || '', 10) || DEFAULT_MAX_AGE_DAYS;
    const maxInactiveDays = parseInt(searchParams.get('maxInactiveDays') || '', 10) || DEFAULT_MAX_INACTIVE_DAYS;
    const dryRun = searchParams.get('dryRun') === 'true';

    // Optional: Verify authorization token for production
    const authToken = request.headers.get('Authorization');
    const expectedToken = process.env.CLEANUP_AUTH_TOKEN;
    if (expectedToken && authToken !== `Bearer ${expectedToken}`) {
      console.warn('[Cleanup] Unauthorized cleanup attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const maxInactiveMs = maxInactiveDays * 24 * 60 * 60 * 1000;

    const storage = loadStorage();
    const totalBefore = Object.keys(storage).length;
    const removedIds: string[] = [];
    const reasons: { [id: string]: string } = {};

    console.log(`[Cleanup] Starting cleanup. Total entries: ${totalBefore}`);
    console.log(`[Cleanup] Max age: ${maxAgeDays} days, Max inactive: ${maxInactiveDays} days, Dry run: ${dryRun}`);

    // Check each entry
    for (const [id, data] of Object.entries(storage)) {
      const age = now - data.createdAt;
      const inactive = now - (data.lastAccessedAt || data.createdAt);

      // Check if entry should be removed
      if (age > maxAgeMs) {
        removedIds.push(id);
        reasons[id] = `Created ${Math.floor(age / (24 * 60 * 60 * 1000))} days ago (max: ${maxAgeDays})`;
      } else if (inactive > maxInactiveMs) {
        removedIds.push(id);
        reasons[id] = `Last accessed ${Math.floor(inactive / (24 * 60 * 60 * 1000))} days ago (max: ${maxInactiveDays})`;
      }
    }

    // Remove entries (unless dry run)
    if (!dryRun) {
      for (const id of removedIds) {
        delete storage[id];
      }
      saveStorage(storage);
    }

    const result: CleanupResult = {
      totalBefore,
      totalAfter: totalBefore - removedIds.length,
      removed: removedIds.length,
      removedIds,
      reasons,
    };

    console.log(`[Cleanup] Completed. Removed: ${result.removed}, Remaining: ${result.totalAfter}`);
    if (removedIds.length > 0) {
      console.log('[Cleanup] Removed IDs:', removedIds.join(', '));
    }

    return NextResponse.json({
      success: true,
      dryRun,
      config: { maxAgeDays, maxInactiveDays },
      result,
    });
  } catch (e) {
    console.error('[Cleanup] Failed to run cleanup:', e);
    return NextResponse.json({ error: 'Cleanup failed', details: String(e) }, { status: 500 });
  }
}

// GET: Get cleanup status/stats
export async function GET() {
  try {
    const storage = loadStorage();
    const now = Date.now();

    const entries = Object.entries(storage);
    const stats = {
      total: entries.length,
      oldest: null as string | null,
      newest: null as string | null,
      oldestAge: 0,
      newestAge: 0,
      avgAge: 0,
      avgInactive: 0,
    };

    if (entries.length > 0) {
      let totalAge = 0;
      let totalInactive = 0;
      let oldestTime = Infinity;
      let newestTime = 0;

      for (const [id, data] of entries) {
        const age = now - data.createdAt;
        const inactive = now - (data.lastAccessedAt || data.createdAt);

        totalAge += age;
        totalInactive += inactive;

        if (data.createdAt < oldestTime) {
          oldestTime = data.createdAt;
          stats.oldest = id;
          stats.oldestAge = Math.floor(age / (24 * 60 * 60 * 1000));
        }
        if (data.createdAt > newestTime) {
          newestTime = data.createdAt;
          stats.newest = id;
          stats.newestAge = Math.floor(age / (24 * 60 * 60 * 1000));
        }
      }

      stats.avgAge = Math.floor(totalAge / entries.length / (24 * 60 * 60 * 1000));
      stats.avgInactive = Math.floor(totalInactive / entries.length / (24 * 60 * 60 * 1000));
    }

    return NextResponse.json({
      config: {
        maxAgeDays: DEFAULT_MAX_AGE_DAYS,
        maxInactiveDays: DEFAULT_MAX_INACTIVE_DAYS,
      },
      stats,
    });
  } catch (e) {
    console.error('[Cleanup] Failed to get stats:', e);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
