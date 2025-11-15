import { NextRequest, NextResponse } from 'next/server';

type StreamType = 'iframe' | 'hls';

interface StreamCandidate {
  url: string;
  type: StreamType;
  score: number;
  source: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BLOCKED_PATTERNS = [
  /doubleclick/i,
  /adservice/i,
  /googlesyndication/i,
  /facebook/i,
  /twitter/i,
  /discord/i,
  /reddit/i,
  /instagram/i,
  /tiktok/i,
  /target=/i,
  /share=/i,
];

const PREFERRED_KEYWORDS = ['embed', 'player', 'stream', 'live', 'watch', 'iframe', 'video'];

const M3U8_REGEX = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
const IFRAME_REGEX = /<iframe\b[^>]*>(?:<\/iframe>)?/gi;
const ALL_STREAMS_REGEX = /const\s+allStreams\s*=\s*(\[[\s\S]*?\]);/i;

function ensureAbsoluteUrl(candidate: string, base: URL): string | null {
  try {
    const decoded = candidate.replace(/&amp;/g, '&').trim();
    if (!decoded) {
      return null;
    }
    if (decoded.startsWith('//')) {
      return `${base.protocol}${decoded}`;
    }
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return decoded;
    }
    return new URL(decoded, base).toString();
  } catch {
    return null;
  }
}

function scoreCandidate(src: string, tag: string): StreamCandidate {
  const lowerSrc = src.toLowerCase();
  let score = 0;

  PREFERRED_KEYWORDS.forEach((keyword, idx) => {
    if (lowerSrc.includes(keyword)) {
      score += 5 - Math.min(idx, 4);
    }
  });

  if (lowerSrc.includes('crackstreams')) {
    score += 1;
  }
  if (tag.includes('allowfullscreen')) {
    score += 1;
  }
  if (/width=["']?100%/.test(tag) || /height=["']?100%/.test(tag)) {
    score += 1;
  }

  const type: StreamType = lowerSrc.includes('.m3u8') ? 'hls' : 'iframe';

  return {
    url: src,
    type,
    score,
    source: tag,
  };
}

function collectIframeCandidates(html: string, baseUrl: URL): StreamCandidate[] {
  const candidates: StreamCandidate[] = [];

  let match: RegExpExecArray | null;
  while ((match = IFRAME_REGEX.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/(?:src|data-src)=["']([^"']+)["']/i);
    if (!srcMatch) {
      continue;
    }
    const absolute = ensureAbsoluteUrl(srcMatch[1], baseUrl);
    if (!absolute) {
      continue;
    }
    if (BLOCKED_PATTERNS.some((pattern) => pattern.test(absolute))) {
      continue;
    }
    candidates.push(scoreCandidate(absolute, tag));
  }

  return candidates;
}

function collectM3u8Candidates(html: string): StreamCandidate[] {
  const matches = html.match(M3U8_REGEX) ?? [];
  return matches.map((raw) => ({
    url: raw,
    type: 'hls',
    score: 2,
    source: 'm3u8-regex',
  }));
}

function extractAllStreamsEmbed(html: string, baseUrl: URL): StreamCandidate | null {
  const match = html.match(ALL_STREAMS_REGEX);
  if (!match) {
    return null;
  }

  const rawArray = match[1];
  try {
    const parsed = JSON.parse(rawArray);
    if (!Array.isArray(parsed)) {
      return null;
    }

    for (const stream of parsed) {
      if (!stream || typeof stream.value !== 'string') continue;
      const absolute = ensureAbsoluteUrl(stream.value, baseUrl);
      if (!absolute) continue;

      return {
        url: absolute,
        type: 'iframe',
        score: 100,
        source: 'allStreams-script',
      };
    }
  } catch (err) {
    console.warn('Failed to parse CrackStreams allStreams JSON:', err);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const inputUrl = request.nextUrl.searchParams.get('url');

  if (!inputUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(inputUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
  }

  if (!/crackstreams/i.test(target.hostname)) {
    return NextResponse.json({ error: 'URL must be a CrackStreams link' }, { status: 400 });
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${target.protocol}//${target.hostname}/`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to load CrackStreams page (${response.status})` },
        { status: response.status },
      );
    }

    const html = await response.text();
    const scriptCandidate = extractAllStreamsEmbed(html, target);
    const iframeCandidates = collectIframeCandidates(html, target);
    const m3u8Candidates = iframeCandidates.length === 0 ? collectM3u8Candidates(html) : [];
    const candidates = [
      ...(scriptCandidate ? [scriptCandidate] : []),
      ...iframeCandidates,
      ...m3u8Candidates,
    ].sort((a, b) => b.score - a.score);
    const best = candidates[0];

    if (!best) {
      return NextResponse.json(
        { error: 'Unable to locate an embedded stream on this CrackStreams page' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      embedUrl: best.url,
      streamType: best.type,
      score: best.score,
    });
  } catch (error) {
    console.error('CrackStreams extraction error:', error);
    return NextResponse.json(
      { error: 'Unexpected error extracting CrackStreams stream' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';

