import { NextRequest, NextResponse } from 'next/server';

function buildBaseHref(target: URL): string {
  const url = new URL(target.toString());
  url.hash = '';
  let pathname = url.pathname;

  if (!pathname.endsWith('/')) {
    const lastSlash = pathname.lastIndexOf('/');
    pathname = lastSlash === -1 ? '/' : pathname.slice(0, lastSlash + 1);
  }

  if (!pathname.endsWith('/')) {
    pathname += '/';
  }

  return `${url.origin}${pathname}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    const parsedTargetUrl = new URL(targetUrl);

    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      // Fetch the target URL with comprehensive browser-like headers
      // This helps bypass bot detection that blocks server-side requests
      // Note: Some sites block Vercel IPs regardless of headers
      // Using Edge Runtime may help as it uses different IP ranges
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          // Note: Removed Accept-Encoding as Node.js fetch handles decompression automatically
          'Accept-Charset': 'utf-8',
          'Referer': parsedTargetUrl.origin + '/',
          'Origin': parsedTargetUrl.origin,
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        redirect: 'follow',
        signal: controller.signal,
        // Add credentials to potentially help with some sites
        credentials: 'omit',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Log additional details for debugging
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        console.error('Proxy fetch failed:', {
          url: targetUrl,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });

        return NextResponse.json(
          {
            error: `Failed to fetch: ${response.status} ${response.statusText}`,
            url: targetUrl,
            // Include some response headers that might help debug
            details: response.status === 403
              ? 'The target site is blocking server-side requests. This is common with streaming sites that detect Vercel IP addresses.'
              : undefined
          },
          { status: response.status }
        );
      }

      // Get the response body
      let html = await response.text();

      // Remove anti-iframe detection scripts
      // Many streaming sites check if they're in an iframe and show errors
      // We'll strip out common patterns that detect iframes
      
      // Remove scripts that check window.self !== window.top (iframe detection)
      html = html.replace(
        /<script[^>]*>[\s\S]*?(window\.self\s*!==?\s*window\.top|window\.top\s*!==?\s*window\.self|self\s*!==?\s*top|top\s*!==?\s*self)[\s\S]*?<\/script>/gi,
        '<!-- iframe detection script removed -->'
      );
      
      // Remove scripts that check window.frameElement
      html = html.replace(
        /<script[^>]*>[\s\S]*?window\.frameElement[\s\S]*?<\/script>/gi,
        '<!-- frameElement check script removed -->'
      );
      
      // Remove error banners and messages about sandbox or embedding
      // These sites often have error messages baked into the HTML
      html = html.replace(
        /<div[^>]*>[\s\S]*?Remove sandbox attr[\s\S]*?<\/div>/gi,
        '<!-- error banner removed -->'
      );
      html = html.replace(
        /<h[1-6][^>]*>[\s\S]*?Remove sandbox[\s\S]*?<\/h[1-6]>/gi,
        '<!-- error header removed -->'
      );
      html = html.replace(
        /<p[^>]*>[\s\S]*?sandbox[\s\S]*?iframe[\s\S]*?<\/p>/gi,
        '<!-- error paragraph removed -->'
      );

      // Rewrite relative URLs to absolute URLs pointing to the original domain
      // This ensures scripts, stylesheets, and other resources load correctly
      const origin = parsedTargetUrl.origin;
      const baseHref = buildBaseHref(parsedTargetUrl);
      
      // Rewrite script src attributes (handles both single and double quotes)
      html = html.replace(
        /<script([^>]*)\ssrc=["'](\/[^"']+)["']/gi,
        (match, attrs, path) => {
          // Skip if already absolute URL
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
            return match;
          }
          return `<script${attrs} src="${origin}${path}"`;
        }
      );
      
      // Rewrite link href attributes for stylesheets and other resources
      html = html.replace(
        /<link([^>]*)\shref=["'](\/[^"']+)["']/gi,
        (match, attrs, path) => {
          // Skip if already absolute URL
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
            return match;
          }
          return `<link${attrs} href="${origin}${path}"`;
        }
      );
      
      // Rewrite img src attributes
      html = html.replace(
        /<img([^>]*)\ssrc=["'](\/[^"']+)["']/gi,
        (match, attrs, path) => {
          // Skip if already absolute URL
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
            return match;
          }
          return `<img${attrs} src="${origin}${path}"`;
        }
      );
      
      // Rewrite relative URLs in script content (for dynamically loaded scripts)
      // This handles cases where JavaScript code constructs URLs
      html = html.replace(
        /(["'])(\/[^"']+\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot))(["'])/gi,
        (match, quote1, path, ext, quote2) => {
          // Skip if already absolute URL or if it's a data URL
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') || path.startsWith('data:')) {
            return match;
          }
          return `${quote1}${origin}${path}${quote2}`;
        }
      );

      // Inject CSS and JavaScript for muting and hiding elements
      // Escape origin for use in JavaScript string
      const escapedOrigin = origin.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
      const injectedCode = `
      <script>
        // ===== ANTI-DETECTION CODE =====
        // Override iframe detection methods before any other scripts run
        (function() {
          // Make the page think it's not in an iframe
          try {
            Object.defineProperty(window, 'frameElement', {
              get: function() { return null; },
              configurable: false
            });
          } catch (e) {}
          
          try {
            Object.defineProperty(window, 'top', {
              get: function() { return window.self; },
              configurable: false
            });
          } catch (e) {}
          
          try {
            Object.defineProperty(window, 'parent', {
              get: function() { return window.self; },
              configurable: false
            });
          } catch (e) {}
          
          // Override common iframe detection checks
          window.isInIframe = function() { return false; };
          window.inIframe = false;
        })();
        
        // Remove error messages from DOM after page loads
        document.addEventListener('DOMContentLoaded', function() {
          // Remove any elements containing iframe/sandbox error messages
          setTimeout(function() {
            var errorTexts = ['Remove sandbox', 'sandbox attributes', 'iframe tag', 'embedding', 'not allowed'];
            var allElements = document.querySelectorAll('*');
            allElements.forEach(function(el) {
              var text = el.textContent || '';
              if (errorTexts.some(function(err) { return text.toLowerCase().includes(err.toLowerCase()); }) &&
                  text.length < 500 && // Only small text blocks (error messages)
                  getComputedStyle(el).display !== 'none') {
                // Check if this looks like an error banner
                var rect = el.getBoundingClientRect();
                if (rect.width > 200 && rect.height < 300 && rect.top < 200) {
                  console.log('[PROXY] Hiding error element:', el);
                  el.style.display = 'none !important';
                  el.remove();
                }
              }
            });
          }, 1000);
        });
        
        // ===== URL REWRITING CODE =====
        // Rewrite relative URLs to absolute URLs pointing to the original domain
        (function() {
          const originalDomain = '${escapedOrigin}';
          
          // Override document.createElement to rewrite script/link src/href
          const originalCreateElement = document.createElement.bind(document);
          document.createElement = function(tagName, options) {
            const element = originalCreateElement(tagName, options);
            
            if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'link') {
              const originalSetAttribute = element.setAttribute.bind(element);
              element.setAttribute = function(name, value) {
                if ((name === 'src' || name === 'href') && typeof value === 'string') {
                  // Convert relative URLs to absolute
                  if (value.startsWith('/') && !value.startsWith('//')) {
                    value = originalDomain + value;
                  }
                }
                return originalSetAttribute(name, value);
              };
            }
            
            return element;
          };
          
          // Also intercept script/link elements added via innerHTML/outerHTML
          const rewriteUrlsInString = function(htmlString) {
            return htmlString.replace(
              /(src|href)=["'](\\x2F[^"']+)["']/gi,
              function(match, attr, path) {
                if (path.startsWith('//')) return match; // Skip protocol-relative URLs
                return attr + '="' + originalDomain + path + '"';
              }
            );
          };
          
          // Override innerHTML/outerHTML setters
          const overrideProperty = function(obj, prop) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
            if (!descriptor || !descriptor.set) return;
            
            const originalSetter = descriptor.set;
            Object.defineProperty(obj, prop, {
              set: function(value) {
                if (typeof value === 'string') {
                  value = rewriteUrlsInString(value);
                }
                originalSetter.call(this, value);
              },
              get: descriptor.get,
              configurable: true,
              enumerable: descriptor.enumerable
            });
          };
          
          // Override for common elements
          ['HTMLScriptElement', 'HTMLLinkElement', 'HTMLImageElement'].forEach(function(className) {
            const proto = window[className]?.prototype;
            if (proto) {
              overrideProperty(proto, 'innerHTML');
              overrideProperty(proto, 'outerHTML');
            }
          });
        })();
        
        // ===== POPUP BLOCKING CODE =====
        // Block all popups and new window attempts
        (function() {
          // Save original window.open
          const originalWindowOpen = window.open;
          
          // Override window.open to block popups
          window.open = function() {
            console.log('[POPUP BLOCKED] Attempted to open popup');
            return null;
          };
          
          // Block popunder attempts
          window.blur = function() {};
          window.focus = function() {};
          
          // Prevent clicks from opening new windows - MUST run in capture phase
          const blockPopupEvent = function(e) {
            // Check if the target or any parent has attributes that indicate popup behavior
            let target = e.target;
            let blocked = false;
            
            // Allow clicks on actual video players and their controls
            const isVideoControl = target.closest && target.closest('video, .jwplayer, [class*="jw-"], [class*="player-"], [id*="player"], button[aria-label*="play"], button[aria-label*="pause"], button[aria-label*="volume"]');
            if (isVideoControl && !target.href) {
              return; // Allow video control clicks
            }
            
            while (target && target !== document) {
              const href = target.href || target.getAttribute && target.getAttribute('href') || '';
              const onclick = target.onclick?.toString() || target.getAttribute && target.getAttribute('onclick') || '';
              
              // More aggressive popup detection
              if (target.target === '_blank' || 
                  onclick.includes('window.open') ||
                  onclick.includes('.open(') ||
                  href.includes('javascript:') ||
                  href.includes('about:blank') ||
                  href.includes('void(0)') ||
                  href.match(/^https?:\/\/[^\/]+\/?$/) || // Domain-only links (often popups)
                  href.includes('pop') ||
                  href.includes('/go/') ||
                  href.includes('/track/') ||
                  href.includes('/click/') ||
                  href.includes('/redirect') ||
                  target.className?.includes('ad') ||
                  target.className?.includes('pop') ||
                  target.id?.includes('ad-') ||
                  target.id?.includes('pop')) {
                blocked = true;
                break;
              }
              target = target.parentElement;
            }
            
            if (blocked) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              console.log('[POPUP BLOCKED] Prevented popup from ' + e.type);
              return false;
            }
          };
          
          // Block on all mouse and touch events that could trigger popups
          document.addEventListener('click', blockPopupEvent, true);
          document.addEventListener('mousedown', blockPopupEvent, true);
          document.addEventListener('mouseup', blockPopupEvent, true);
          document.addEventListener('auxclick', blockPopupEvent, true); // Middle click
          document.addEventListener('pointerdown', blockPopupEvent, true);
          document.addEventListener('pointerup', blockPopupEvent, true);
          document.addEventListener('touchstart', blockPopupEvent, true);
          document.addEventListener('touchend', blockPopupEvent, true); // Critical for mobile
          document.addEventListener('contextmenu', blockPopupEvent, true);
          
          // Also block on the body when it loads
          window.addEventListener('load', function() {
            document.body.addEventListener('click', blockPopupEvent, true);
            document.body.addEventListener('mousedown', blockPopupEvent, true);
            document.body.addEventListener('mouseup', blockPopupEvent, true);
          });
          
          // Intercept addEventListener to detect and block popup-registering handlers
          const originalAddEventListener = EventTarget.prototype.addEventListener;
          EventTarget.prototype.addEventListener = function(type, listener, options) {
            // Check if this is a click/mouse/touch event with a popup handler
            const suspiciousEvents = ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'];
            if (suspiciousEvents.includes(type) && typeof listener === 'function') {
              const listenerStr = listener.toString();
              if (listenerStr.includes('window.open') || 
                  listenerStr.includes('.open(') ||
                  listenerStr.includes('popup') ||
                  listenerStr.includes('popunder') ||
                  listenerStr.includes('location.href') ||
                  listenerStr.includes('window.location')) {
                console.log('[POPUP BLOCKED] Prevented registration of popup handler for ' + type);
                // Don't register the popup handler
                return;
              }
            }
            // Allow normal event listeners
            return originalAddEventListener.call(this, type, listener, options);
          };
          
          // Block popups from being added via DOM manipulation
          const originalCreateElement = document.createElement.bind(document);
          document.createElement = function(tagName) {
            const element = originalCreateElement(tagName);
            if (tagName.toLowerCase() === 'a') {
              // Intercept anchor creation
              const originalSetAttribute = element.setAttribute.bind(element);
              element.setAttribute = function(name, value) {
                if (name === 'target' && value === '_blank') {
                  console.log('[POPUP BLOCKED] Prevented target=_blank');
                  return;
                }
                return originalSetAttribute(name, value);
              };
            }
            return element;
          };
          
          // Prevent beforeunload/unload popup tricks
          window.addEventListener('beforeunload', function(e) {
            e.preventDefault();
            delete e.returnValue;
          });
          
          // Block setTimeout/setInterval popups
          const originalSetTimeout = window.setTimeout;
          const originalSetInterval = window.setInterval;
          
          window.setTimeout = function(fn, delay) {
            if (typeof fn === 'string' && (fn.includes('window.open') || fn.includes('popup'))) {
              console.log('[POPUP BLOCKED] Blocked setTimeout popup');
              return;
            }
            return originalSetTimeout.apply(this, arguments);
          };
          
          window.setInterval = function(fn, delay) {
            if (typeof fn === 'string' && (fn.includes('window.open') || fn.includes('popup'))) {
              console.log('[POPUP BLOCKED] Blocked setInterval popup');
              return;
            }
            return originalSetInterval.apply(this, arguments);
          };
          
          // Block document.write popups
          const originalDocumentWrite = document.write.bind(document);
          document.write = function(content) {
            if (content.includes('window.open') || content.includes('popup')) {
              console.log('[POPUP BLOCKED] Blocked document.write popup');
              return;
            }
            return originalDocumentWrite(content);
          };
          
          // Nuclear option: Monitor and remove target="_blank" from all anchor tags
          const cleanAnchorTags = function() {
            document.querySelectorAll('a[target="_blank"]').forEach(function(anchor) {
              anchor.removeAttribute('target');
              console.log('[POPUP BLOCKED] Removed target=_blank from anchor');
            });
          };
          
          // Run immediately and on DOM changes
          if (document.body) {
            cleanAnchorTags();
          }
          
          document.addEventListener('DOMContentLoaded', cleanAnchorTags);
          window.addEventListener('load', cleanAnchorTags);
          
          // Observe for dynamically added anchor tags
          const anchorObserver = new MutationObserver(cleanAnchorTags);
          if (document.body) {
            anchorObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['target'] });
          } else {
            window.addEventListener('load', function() {
              anchorObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['target'] });
            });
          }
          
          // Prevent context menu manipulations that might trigger popups
          document.addEventListener('contextmenu', function(e) {
            // Allow normal context menu but prevent popup scripts
            if (e.target.onclick?.toString().includes('window.open')) {
              e.preventDefault();
              e.stopPropagation();
            }
          }, true);
          
          // Aggressive overlay/popup removal - runs continuously
          const removePopupOverlays = function() {
            // Remove suspicious overlays and popups
            const selectors = [
              'div[style*="position: fixed"][style*="z-index"]',
              'div[style*="position: absolute"][style*="z-index"]',
              '[class*="popup"]', '[class*="pop-up"]', '[class*="modal"]',
              '[id*="popup"]', '[id*="pop-up"]', '[id*="modal"]',
              '[class*="overlay"]', '[id*="overlay"]',
              'div[style*="z-index: 999"]', 'div[style*="z-index: 9999"]',
              'div[style*="z-index:999"]', 'div[style*="z-index:9999"]'
            ];
            
            selectors.forEach(function(selector) {
              try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(function(el) {
                  // Don't remove video players
                  if (el.querySelector && !el.querySelector('video, .jwplayer, [class*="jw-"]')) {
                    // Check if it's actually a popup (covers most of screen)
                    const rect = el.getBoundingClientRect();
                    if (rect.width > window.innerWidth * 0.5 || rect.height > window.innerHeight * 0.5) {
                      el.remove();
                      console.log('[POPUP BLOCKED] Removed overlay element');
                    }
                  }
                });
              } catch (e) {}
            });
          };
          
          // Run overlay removal periodically
          setInterval(removePopupOverlays, 500); // Check every 500ms
          window.addEventListener('load', removePopupOverlays);
          document.addEventListener('DOMContentLoaded', removePopupOverlays);
        })();
        
        // ===== VIDEO MUTING CODE =====
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
        div[style*="z-index"][style*="999"],
        /* Popup overlays and ads */
        [class*="popup"], [class*="pop-up"], [class*="overlay"],
        [class*="modal"], [class*="lightbox"], [id*="popup"],
        [id*="pop-up"], [id*="overlay"], [id*="modal"],
        /* Ad-related elements */
        [class*="ad-"], [class*="-ad"], [id*="ad-"], [id*="-ad"],
        [class*="banner"], [id*="banner"], ins.adsbygoogle,
        iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
        iframe[src*="advertising"], div[id*="google_ads"],
        /* Common popup/overlay z-index patterns */
        div[style*="z-index: 999"], div[style*="z-index: 9999"],
        div[style*="z-index:999"], div[style*="z-index:9999"] {
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

      const shouldInjectBase = !/<base\s/i.test(html);
      const combinedInjection = `${shouldInjectBase ? `<base href="${baseHref}">` : ''}${injectedCode}`;

      // Inject the code at the very beginning - BEFORE any other scripts can run
      if (html.includes('<head>')) {
        // Inject immediately after opening <head> tag
        html = html.replace('<head>', `<head>${combinedInjection}`);
      } else if (html.includes('<html>')) {
        // Inject immediately after opening <html> tag
        html = html.replace('<html>', `<html>${combinedInjection}`);
      } else if (html.includes('<head')) {
        // Handle <head with attributes
        html = html.replace(/<head([^>]*)>/, `<head$1>${combinedInjection}`);
      } else {
        // Last resort - prepend to entire HTML
        html = combinedInjection + html;
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

      // Add permissive CORS headers
      proxyResponse.headers.set('Access-Control-Allow-Origin', '*');
      proxyResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      proxyResponse.headers.set('Access-Control-Allow-Headers', '*');

      // Add CSP to block popups at browser level while allowing video playback
      // Allow blob: for workers, allow any base-uri for our injected base tag
      proxyResponse.headers.set(
        'Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
        "script-src * 'unsafe-inline' 'unsafe-eval' blob:; " +
        "style-src * 'unsafe-inline'; " +
        "img-src * data: blob:; " +
        "media-src * blob: data:; " +
        "frame-src *; " +
        "connect-src *; " +
        "worker-src * blob:; " +
        "object-src 'none'; " +
        "base-uri *;"
      );

      return proxyResponse;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      // Handle abort/timeout errors
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
        return NextResponse.json(
          { error: 'Request timeout: The request took too long to complete' },
          { status: 408 }
        );
      }
      // Re-throw other errors to be handled by outer catch
      throw fetchError;
    }
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

// Use Edge Runtime - this may use different IP addresses than Node.js runtime
// Edge Functions run on Vercel's edge network which might not be blocked
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

