import { NextRequest, NextResponse } from 'next/server';

interface ServerOption {
  name: string;
  url: string;
  isDefault?: boolean;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

/**
 * Try to extract direct m3u8 URL from the HTML
 * This is the best option as it bypasses all iframe restrictions
 */
function extractM3U8Url(html: string, baseUrl: URL): string | null {
  const m3u8Patterns = [
    // Direct m3u8 URLs in source/file/url properties
    /(?:source|file|url)["'\s:]+["']([^"']+\.m3u8[^"']*)["']/gi,
    // m3u8 URLs in data attributes
    /data-[a-z-]*(?:src|url|stream|file)=["']([^"']+\.m3u8[^"']*)["']/gi,
    // Direct m3u8 URLs anywhere in the HTML
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi,
    // JWPlayer source configurations
    /jwplayer[^{]*\{[^}]*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
    // Video.js source configurations
    /sources\s*:\s*\[\s*\{\s*src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
  ];

  for (const pattern of m3u8Patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      // Validate it's a proper URL
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // Make sure it's actually an m3u8 URL
          if (url.includes('.m3u8')) {
            console.log('[STREAMEAST] Found m3u8 URL:', url);
            return url;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function extractServerOptions(html: string, baseUrl: URL): ServerOption[] {
  const servers: ServerOption[] = [];
  
  // Match server buttons: <button class="server-btn" data-src="...">Server Name</button>
  const serverButtonRegex = /<button[^>]*class="[^"]*server-btn[^"]*"[^>]*data-src=["']([^"']+)["'][^>]*>([^<]+)<\/button>/gi;
  
  let match;
  while ((match = serverButtonRegex.exec(html)) !== null) {
    const url = match[1];
    const name = match[2].trim();
    const isActive = match[0].includes('active');
    
    const absoluteUrl = ensureAbsoluteUrl(url, baseUrl);
    if (absoluteUrl && name) {
      servers.push({
        name,
        url: absoluteUrl,
        isDefault: isActive || servers.length === 0, // First server is default if none marked active
      });
    }
  }
  
  return servers;
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

  if (!/streameast|istreameast/i.test(target.hostname)) {
    return NextResponse.json({ error: 'URL must be a Streameast link' }, { status: 400 });
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
        { error: `Failed to load Streameast page (${response.status})` },
        { status: response.status },
      );
    }

    const html = await response.text();
    const serverOptions = extractServerOptions(html, target);

    if (serverOptions.length === 0) {
      return NextResponse.json(
        { error: 'Unable to locate server options on this Streameast page' },
        { status: 404 },
      );
    }

    // Find default server (marked active or first one)
    const defaultServer = serverOptions.find(s => s.isDefault) || serverOptions[0];

    return NextResponse.json({
      success: true,
      servers: serverOptions,
      defaultServerUrl: defaultServer.url,
      defaultServerName: defaultServer.name,
    });
  } catch (error) {
    console.error('Streameast extraction error:', error);
    return NextResponse.json(
      { error: 'Unexpected error extracting Streameast servers' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';

