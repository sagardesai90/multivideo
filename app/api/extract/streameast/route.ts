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

/**
 * Decode a Streameast `data-e` value: base64 of the embed URL (or iframe HTML)
 * XOR'd with a single-byte key (0x4F in the site's stream.js).
 */
function decodeStreamEmbed(encoded: string, baseUrl: URL): string | null {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return null;
  }
  if (!binary) {
    return null;
  }

  // Fall back to deriving the key from the expected first character in case the site rotates it
  const first = binary.charCodeAt(0);
  const keys = [0x4f, first ^ 'h'.charCodeAt(0), first ^ '<'.charCodeAt(0), first ^ '/'.charCodeAt(0)];
  for (const key of keys) {
    const decoded = Array.from(binary, (c) => String.fromCharCode(c.charCodeAt(0) ^ key)).join('').trim();
    const iframeSrc = decoded.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)?.[1];
    const candidate = (iframeSrc ?? decoded).trim();
    if (/^(https?:)?\/\//.test(candidate)) {
      return ensureAbsoluteUrl(candidate, baseUrl);
    }
  }

  return null;
}

function extractStreamButtons(html: string, baseUrl: URL): ServerOption[] {
  const servers: ServerOption[] = [];

  // Match stream buttons: <button class="stream-btn active" data-e="..." onclick="switchStream(this)">Stream 1</button>
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;

  let match;
  while ((match = buttonRegex.exec(html)) !== null) {
    const attrs = match[1];
    const className = attrs.match(/class=["']([^"']*)["']/i)?.[1] ?? '';
    if (!/\bstream-btn\b/.test(className)) {
      continue;
    }

    const encoded = attrs.match(/data-e=["']([^"']+)["']/i)?.[1];
    const url = encoded ? decodeStreamEmbed(encoded, baseUrl) : null;
    if (!url || servers.some((s) => s.url === url)) {
      continue;
    }

    servers.push({
      name: match[2].replace(/<[^>]+>/g, '').trim() || `Stream ${servers.length + 1}`,
      url,
      isDefault: /\bactive\b/.test(className),
    });
  }

  // Pages with a single stream may only set data-e on the player container
  if (servers.length === 0) {
    const encoded = html.match(/data-e=["']([^"']+)["']/i)?.[1];
    const url = encoded ? decodeStreamEmbed(encoded, baseUrl) : null;
    if (url) {
      servers.push({ name: 'Stream 1', url, isDefault: true });
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

  // Streameast rotates through mirror domains (streameast, istreameast, streamseaste, ...)
  if (!/streams?east/i.test(target.hostname)) {
    return NextResponse.json({ error: 'URL must be a Streameast link' }, { status: 400 });
  }

  try {
    let response = await fetch(target.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${target.protocol}//${target.hostname}/`,
      },
      cache: 'no-store',
    });

    // If blocked (403), try through Railway proxy if configured
    if (!response.ok && response.status === 403) {
      const fallbackProxyUrl = process.env.NEXT_PUBLIC_FALLBACK_PROXY_URL;
      if (fallbackProxyUrl) {
        console.log('[STREAMEAST EXTRACTION] Primary fetch blocked (403), trying Railway proxy...');
        try {
          // Fetch through Railway proxy
          const proxyResponse = await fetch(
            `${fallbackProxyUrl}/api/proxy?url=${encodeURIComponent(target.toString())}`,
            {
              headers: {
                'User-Agent': USER_AGENT,
              },
              cache: 'no-store',
            }
          );
          
          if (proxyResponse.ok) {
            console.log('[STREAMEAST EXTRACTION] Railway proxy successful!');
            response = proxyResponse;
          }
        } catch (proxyErr) {
          console.error('[STREAMEAST EXTRACTION] Railway proxy also failed:', proxyErr);
        }
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: `Failed to load Streameast page (${response.status})`,
          details: response.status === 403 
            ? 'Streameast is blocking server requests. The site may work with direct connection from your browser.'
            : undefined
        },
        { status: response.status },
      );
    }

    const html = await response.text();
    let serverOptions = extractServerOptions(html, target);
    if (serverOptions.length === 0) {
      serverOptions = extractStreamButtons(html, target);
    }

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

// Run on Edge like the proxy route, which can reach Streameast from production
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

