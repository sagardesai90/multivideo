import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    // Fetch the target URL
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': new URL(targetUrl).origin,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the response body
    let html = await response.text();

    // Inject CSS and JavaScript for muting and hiding elements
    const injectedCode = `
      <script>
        // Global mute state
        let globalMuted = false;
        
        // Function to mute/unmute all videos and audios
        function updateAllMediaMute(muted) {
          globalMuted = muted;
          const mediaElements = document.querySelectorAll('video, audio');
          mediaElements.forEach(function(elem) {
            elem.muted = muted;
            // Also set volume to 0 as backup
            if (muted) {
              elem.volume = 0;
            } else {
              elem.volume = 1;
            }
          });
        }
        
        // Listen for mute/unmute from parent window
        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'MUTE_VIDEO') {
            updateAllMediaMute(event.data.muted);
          }
        });
        
        // Observe for dynamically added videos/audios
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
              if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                node.muted = globalMuted;
                if (globalMuted) {
                  node.volume = 0;
                }
              }
              // Check child nodes
              if (node.querySelectorAll) {
                const mediaElements = node.querySelectorAll('video, audio');
                mediaElements.forEach(function(elem) {
                  elem.muted = globalMuted;
                  if (globalMuted) {
                    elem.volume = 0;
                  }
                });
              }
            });
          });
        });
        
        // Start observing when DOM is ready
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        } else {
          document.addEventListener('DOMContentLoaded', function() {
            observer.observe(document.body, { childList: true, subtree: true });
          });
        }
        
        // Initial check for existing videos
        document.addEventListener('DOMContentLoaded', function() {
          updateAllMediaMute(globalMuted);
        });
        
        // Also check after a delay for lazy-loaded videos
        setTimeout(function() {
          updateAllMediaMute(globalMuted);
        }, 2000);
      </script>
      <style>
        /* Hide all social media and sharing buttons */
        header, footer, nav, .header, .footer, .nav, .navbar, 
        .social-share, .share-buttons, .advertisement, .ad-container,
        .comments, .sidebar, .related-videos, .recommendations,
        .chat-container, .chat, [class*="share"], [class*="social"],
        [id*="share"], [id*="social"], .sharethis-inline-share-buttons,
        /* ShareThis specific */
        .st-btn, .st-inline-share-buttons, .sharethis-inline-share-buttons,
        [class*="sharethis"], [id*="sharethis"],
        /* Social media specific buttons */
        [class*="facebook"], [class*="twitter"], [class*="reddit"],
        [class*="pinterest"], [class*="whatsapp"], [class*="linkedin"],
        [id*="facebook"], [id*="twitter"], [id*="reddit"],
        /* Fixed position social bars */
        div[style*="position: fixed"][style*="bottom"],
        div[style*="z-index"][style*="999"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        
        /* Make body and html fill the space */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        
        /* Make video container and video elements fill the space */
        video, iframe[src*="youtube"], iframe[src*="player"], 
        .video-container, .player-container, [class*="video"], 
        [class*="player"], [id*="video"], [id*="player"] {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
          z-index: 9999 !important;
        }
        
        /* Additional cleanup - hide any remaining fixed elements */
        body > div[style*="position: fixed"] {
          display: none !important;
        }
      </style>
    `;

    // Inject the code before the closing head tag, or at the beginning of body if no head
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${injectedCode}</head>`);
    } else if (html.includes('<body')) {
      html = html.replace('<body', `${injectedCode}<body`);
    } else {
      html = injectedCode + html;
    }

    // Create a new response with modified headers
    const proxyResponse = new NextResponse(html);
    
    // Copy content type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      proxyResponse.headers.set('Content-Type', contentType);
    }

    // Remove X-Frame-Options and CSP headers that prevent embedding
    proxyResponse.headers.delete('X-Frame-Options');
    proxyResponse.headers.delete('Content-Security-Policy');
    proxyResponse.headers.delete('X-Content-Security-Policy');
    
    // Add permissive headers
    proxyResponse.headers.set('Access-Control-Allow-Origin', '*');
    proxyResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    proxyResponse.headers.set('Access-Control-Allow-Headers', '*');

    return proxyResponse;
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

