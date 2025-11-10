import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Provider = {
  id: string;
  activeEndpoints: Array<{ protocol: string }>;
};

type Event = {
  id: string;
  availableProviders: string[];
};

type Playlist = {
  id: string;
  events: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataRoot = path.resolve(__dirname, '../../data');

function loadCollection<T>(segment: string): T[] {
  const segmentPath = path.join(dataRoot, segment);
  const files = readdirSync(segmentPath).filter((entry) => entry.endsWith('.json'));
  return files.map((file) => {
    const fullPath = path.join(segmentPath, file);
    const buffer = readFileSync(fullPath, 'utf-8');
    return JSON.parse(buffer) as T;
  });
}

test('providers expose at least one active endpoint each', () => {
  const providers = loadCollection<Provider>('providers');
  assert.ok(providers.length >= 50, 'expected at least 50 providers for dataset richness');
  providers.forEach((provider) => {
    assert.ok(provider.activeEndpoints.length >= 1, `${provider.id} should offer at least one endpoint`);
  });
});

test('events reference providers that exist on disk', () => {
  const providers = loadCollection<Provider>('providers');
  const providerIds = new Set(providers.map((provider) => provider.id));
  const events = loadCollection<Event>('events');
  events.forEach((event) => {
    assert.ok(event.availableProviders.length >= 2, `${event.id} should have multi-provider coverage`);
    event.availableProviders.forEach((providerId) => {
      assert.ok(providerIds.has(providerId), `${event.id} references missing provider ${providerId}`);
    });
  });
});

test('playlists only include events that exist', () => {
  const events = loadCollection<Event>('events');
  const eventIds = new Set(events.map((event) => event.id));
  const playlists = loadCollection<Playlist>('playlists');
  playlists.forEach((playlist) => {
    assert.ok(playlist.events.length >= 1, `${playlist.id} should include at least one event`);
    playlist.events.forEach((eventId) => {
      assert.ok(eventIds.has(eventId), `${playlist.id} references missing event ${eventId}`);
    });
  });
});

test('dataset folders are structured and non-empty', () => {
  const expectedSegments = ['providers', 'events', 'playlists'];
  expectedSegments.forEach((segment) => {
    const segmentPath = path.join(dataRoot, segment);
    const stats = statSync(segmentPath);
    assert.ok(stats.isDirectory(), `${segmentPath} should be a directory`);
    const entries = readdirSync(segmentPath).filter((entry) => entry.endsWith('.json'));
    assert.ok(entries.length > 0, `${segment} should contain JSON documents`);
  });
});
