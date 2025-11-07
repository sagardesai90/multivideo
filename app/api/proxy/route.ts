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
            
            while (target && target !== document) {
              if (target.target === '_blank' || 
                  target.onclick?.toString().includes('window.open') ||
                  target.href?.includes('javascript:') ||
                  target.href?.includes('about:blank') ||
                  target.getAttribute('onclick')?.includes('window.open') ||
                  target.getAttribute('href')?.includes('javascript:')) {
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
          
          // Block on all mouse events that could trigger popups
          document.addEventListener('click', blockPopupEvent, true);
          document.addEventListener('mousedown', blockPopupEvent, true);
          document.addEventListener('mouseup', blockPopupEvent, true);
          document.addEventListener('auxclick', blockPopupEvent, true); // Middle click
          document.addEventListener('pointerdown', blockPopupEvent, true);
          document.addEventListener('touchstart', blockPopupEvent, true);
          
          // Also block on the body when it loads
          window.addEventListener('load', function() {
            document.body.addEventListener('click', blockPopupEvent, true);
            document.body.addEventListener('mousedown', blockPopupEvent, true);
            document.body.addEventListener('mouseup', blockPopupEvent, true);
          });
          
          // Intercept addEventListener to detect and block popup-registering handlers
          const originalAddEventListener = EventTarget.prototype.addEventListener;
          EventTarget.prototype.addEventListener = function(type, listener, options) {
            // Check if this is a click/mouse event with a popup handler
            if ((type === 'click' || type === 'mousedown' || type === 'mouseup') && 
                typeof listener === 'function') {
              const listenerStr = listener.toString();
              if (listenerStr.includes('window.open') || 
                  listenerStr.includes('.open(') ||
                  listenerStr.includes('popup') ||
                  listenerStr.includes('popunder')) {
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
        })();
        
        // ===== OVERLAY BLOCKING CODE =====
        // Aggressive overlay detection and removal for StreamEast and similar sites
        (function() {
          // Function to check if an element is an overlay/ad
          function isOverlay(element) {
            if (!element || !element.tagName) return false;
            
            // Check class names and IDs for common overlay/ad patterns
            const className = (element.className || '').toLowerCase();
            const id = (element.id || '').toLowerCase();
            const textContent = (element.textContent || '').toLowerCase();
            
            // StreamEast specific patterns
            if (className.includes('chatmate') || id.includes('chatmate') || textContent.includes('chatmate')) return true;
            if (className.includes('install') && (className.includes('app') || className.includes('banner'))) return true;
            if (id.includes('install') && (id.includes('app') || id.includes('banner'))) return true;
            
            // Text-based detection for common overlay content (check first 500 chars for performance)
            const shortText = textContent.substring(0, 500);
            if (shortText.includes('install chatmatetv app') || 
                shortText.includes('video chat with girls') ||
                shortText.includes('tap to start match') ||
                shortText.includes('skip ad') ||
                shortText.includes('go to website') ||
                shortText.includes('for easy access and notifications')) return true;
            
            // Ad overlay patterns
            if (className.includes('ad-overlay') || id.includes('ad-overlay')) return true;
            if (className.includes('ad-container') || id.includes('ad-container')) return true;
            if (className.includes('skip-ad') || id.includes('skip-ad')) return true;
            
            // Check for button elements with overlay text (do this before expensive style checks)
            if (element.tagName === 'BUTTON' || element.tagName === 'A') {
              if (shortText.includes('skip') || shortText.includes('install') || shortText.includes('sign up') || shortText.includes('log in')) {
                // Will be checked later with style.position
                // Continue to style checks below
              }
            }
            
            // Generic overlay patterns
            if (className.includes('overlay') || id.includes('overlay')) return true;
            if (className.includes('popup') || id.includes('popup')) return true;
            if (className.includes('modal') || id.includes('modal')) return true;
            if (className.includes('lightbox') || id.includes('lightbox')) return true;
            
            // Banner patterns
            if (className.includes('banner') || id.includes('banner')) return true;
            if (className.includes('promo') || id.includes('promo')) return true;
            if (className.includes('install') || id.includes('install')) return true;
            
            // Check for high z-index (common for overlays)
            let style, zIndex, position, width, height, rect;
            try {
              style = window.getComputedStyle(element);
              zIndex = parseInt(style.zIndex) || 0;
              position = style.position;
              width = style.width;
              height = style.height;
              rect = element.getBoundingClientRect();
            } catch (e) {
              // Element might be detached, skip
              return false;
            }
            
            // Check for button/link elements with overlay text positioned as overlays
            if ((element.tagName === 'BUTTON' || element.tagName === 'A') && 
                (shortText.includes('skip') || shortText.includes('install') || 
                 shortText.includes('sign up') || shortText.includes('log in'))) {
              if (position === 'fixed' || position === 'absolute') {
                return true;
              }
            }
            
            // Check for high z-index overlays
            if (zIndex >= 100 && (position === 'fixed' || position === 'absolute')) {
              // But exclude video elements
              if (element.tagName !== 'VIDEO' && element.tagName !== 'IFRAME' && 
                  !className.includes('video') && !id.includes('video') &&
                  !className.includes('player') && !id.includes('player')) {
                // Check if element covers significant portion of screen
                const coversLargeArea = rect.width > window.innerWidth * 0.5 && 
                                       rect.height > window.innerHeight * 0.3;
                
                // If it's a high z-index element covering large area, it's likely an overlay
                if (coversLargeArea && zIndex >= 1000) {
                  return true;
                }
              }
            }
            
            // Check for full-screen blocking elements
            if (position === 'fixed') {
              const isFullWidth = width === '100%' || width === '100vw' || rect.width >= window.innerWidth * 0.9;
              const isFullHeight = height === '100%' || height === '100vh' || rect.height >= window.innerHeight * 0.9;
              
              if ((isFullWidth || isFullHeight) && zIndex > 100) {
                // Exclude video containers
                if (!className.includes('video') && !id.includes('video') &&
                    !className.includes('player') && !id.includes('player') &&
                    element.tagName !== 'VIDEO' && element.tagName !== 'IFRAME') {
                  return true;
                }
              }
            }
            
            return false;
          }
          
          // Function to remove overlay elements
          function removeOverlays() {
            const allElements = document.querySelectorAll('*');
            let removedCount = 0;
            
            allElements.forEach(function(element) {
              // Skip if already removed or is video/iframe
              if (!element.parentNode) return;
              if (element.tagName === 'VIDEO' || element.tagName === 'IFRAME') return;
              
              if (isOverlay(element)) {
                console.log('[OVERLAY BLOCKED] Removing overlay:', element.className || element.id || element.tagName);
                element.style.display = 'none';
                element.style.visibility = 'hidden';
                element.style.opacity = '0';
                element.style.pointerEvents = 'none';
                // Try to remove from DOM
                try {
                  element.remove();
                } catch (e) {
                  // If remove fails, ensure it's hidden
                  element.style.setProperty('display', 'none', 'important');
                }
                removedCount++;
              }
            });
            
            if (removedCount > 0) {
              console.log('[OVERLAY BLOCKED] Removed', removedCount, 'overlay elements');
            }
          }
          
          // Function to block overlay creation via DOM manipulation
          function setupOverlayPrevention() {
            // Monitor for dynamically added overlays
            const overlayObserver = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                  if (node.nodeType === 1) { // Element node
                    if (isOverlay(node)) {
                      console.log('[OVERLAY BLOCKED] Preventing overlay from being added:', node.className || node.id);
                      try {
                        node.remove();
                      } catch (e) {
                        if (node.parentNode) {
                          node.parentNode.removeChild(node);
                        }
                      }
                    }
                    
                    // Check child elements
                    if (node.querySelectorAll) {
                      const overlays = node.querySelectorAll('*');
                      overlays.forEach(function(element) {
                        if (isOverlay(element)) {
                          console.log('[OVERLAY BLOCKED] Removing child overlay:', element.className || element.id);
                          try {
                            element.remove();
                          } catch (e) {
                            element.style.display = 'none';
                            element.style.visibility = 'hidden';
                            element.style.opacity = '0';
                            element.style.pointerEvents = 'none';
                          }
                        }
                      });
                    }
                  }
                });
              });
            });
            
            // Start observing when DOM is ready
            if (document.body) {
              overlayObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'id']
              });
              
              // Initial cleanup
              removeOverlays();
            } else {
              document.addEventListener('DOMContentLoaded', function() {
                overlayObserver.observe(document.body, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ['style', 'class', 'id']
                });
                removeOverlays();
              });
            }
            
            // Periodic cleanup (catch overlays that appear after delays like 10 minutes)
            setInterval(removeOverlays, 1000); // Check every second
            
            // Also run cleanup on page load
            window.addEventListener('load', function() {
              setTimeout(removeOverlays, 100);
              setTimeout(removeOverlays, 1000);
              setTimeout(removeOverlays, 5000);
            });
            
            // Cleanup after longer delays (for delayed overlays)
            setTimeout(removeOverlays, 60000);  // 1 minute
            setTimeout(removeOverlays, 300000); // 5 minutes
            setTimeout(removeOverlays, 600000); // 10 minutes
            setTimeout(removeOverlays, 900000); // 15 minutes
          }
          
          // Start overlay prevention
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupOverlayPrevention);
          } else {
            setupOverlayPrevention();
          }
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
        div[style*="z-index:999"], div[style*="z-index:9999"],
        /* StreamEast specific overlays - chatmate.tv */
        [class*="chatmate"], [id*="chatmate"],
        [class*="chatmate.tv"], [id*="chatmate.tv"],
        /* Install app banners */
        [class*="install"][class*="app"], [id*="install"][id*="app"],
        [class*="install-app"], [id*="install-app"],
        [class*="app-banner"], [id*="app-banner"],
        [class*="install-banner"], [id*="install-banner"],
        /* Ad overlay controls */
        [class*="skip-ad"], [id*="skip-ad"],
        [class*="ad-control"], [id*="ad-control"],
        [class*="ad-control-bar"], [id*="ad-control-bar"],
        /* Video chat overlays */
        [class*="video-chat"], [id*="video-chat"],
        [class*="chat-with"], [id*="chat-with"],
        /* Full-screen overlays that block video */
        div[style*="position: fixed"][style*="z-index"][style*="100"],
        div[style*="position: absolute"][style*="z-index"][style*="100"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
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

    // Inject the code at the very beginning - BEFORE any other scripts can run
    if (html.includes('<head>')) {
      // Inject immediately after opening <head> tag
      html = html.replace('<head>', `<head>${injectedCode}`);
    } else if (html.includes('<html>')) {
      // Inject immediately after opening <html> tag
      html = html.replace('<html>', `<html>${injectedCode}`);
    } else if (html.includes('<head')) {
      // Handle <head with attributes
      html = html.replace(/<head([^>]*)>/, `<head$1>${injectedCode}`);
    } else {
      // Last resort - prepend to entire HTML
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
    
    // Add permissive CORS headers
    proxyResponse.headers.set('Access-Control-Allow-Origin', '*');
    proxyResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    proxyResponse.headers.set('Access-Control-Allow-Headers', '*');
    
    // Add CSP to block popups at browser level while allowing video playback
    proxyResponse.headers.set(
      'Content-Security-Policy',
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "script-src * 'unsafe-inline' 'unsafe-eval'; " +
      "style-src * 'unsafe-inline'; " +
      "img-src * data: blob:; " +
      "media-src * blob: data:; " +
      "frame-src *; " +
      "connect-src *; " +
      "object-src 'none'; " +
      "base-uri 'self';"
    );

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

