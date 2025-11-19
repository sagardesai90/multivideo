import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Simple file-based storage for development
// In production, use Redis, PostgreSQL, or another persistent store
const STORAGE_FILE = join(process.cwd(), '.share-storage.json');

interface ShareData {
  numSlots: number;
  slotOrder: number[];
  videoUrls: { [key: string]: string }; // slot index -> url
  createdAt: number;
  lastAccessedAt: number;
}

interface StorageData {
  [id: string]: ShareData;
}

// Generate a short random ID (6 characters, alphanumeric)
function generateShortId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function loadStorage(): StorageData {
  try {
    if (existsSync(STORAGE_FILE)) {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load share storage:', e);
  }
  return {};
}

function saveStorage(data: StorageData): void {
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save share storage:', e);
  }
}

// POST: Create a new short share link
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { numSlots, slotOrder, videoUrls } = body;

    // Validate input
    if (typeof numSlots !== 'number' || numSlots < 1 || numSlots > 9) {
      return NextResponse.json({ error: 'Invalid numSlots' }, { status: 400 });
    }

    if (!Array.isArray(slotOrder) || slotOrder.length !== 9) {
      return NextResponse.json({ error: 'Invalid slotOrder' }, { status: 400 });
    }

    if (typeof videoUrls !== 'object') {
      return NextResponse.json({ error: 'Invalid videoUrls' }, { status: 400 });
    }

    // Generate unique short ID
    const storage = loadStorage();
    let id = generateShortId();
    let attempts = 0;
    while (storage[id] && attempts < 10) {
      id = generateShortId();
      attempts++;
    }

    if (storage[id]) {
      return NextResponse.json({ error: 'Failed to generate unique ID' }, { status: 500 });
    }

    // Store the share data
    const now = Date.now();
    storage[id] = {
      numSlots,
      slotOrder,
      videoUrls,
      createdAt: now,
      lastAccessedAt: now,
    };

    saveStorage(storage);

    return NextResponse.json({ id, success: true });
  } catch (e) {
    console.error('Failed to create share:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: Retrieve share data by ID
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID parameter is required' }, { status: 400 });
    }

    const storage = loadStorage();
    const data = storage[id];

    if (!data) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }

    // Update last accessed time
    data.lastAccessedAt = Date.now();
    saveStorage(storage);

    return NextResponse.json(data);
  } catch (e) {
    console.error('Failed to retrieve share:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
