(() => {
  const html = document.documentElement;
  if (!html) {
    return;
  }

  const isYouTubeHome = () => /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === '/';

  function ensureStyle() {
    if (document.getElementById('tube-flow-prehide')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'tube-flow-prehide';
    style.textContent = `
      html.hd-home-target ytd-rich-grid-renderer #contents ytd-rich-item-renderer {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents ytd-rich-item-renderer.hd-visible {
        visibility: visible !important;
        opacity: 1 !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents ytd-rich-item-renderer.hd-hidden {
        display: none !important;
      }
      html.hd-home-target ytd-reel-shelf-renderer,
      html.hd-home-target ytd-rich-shelf-renderer[is-shorts],
      html.hd-home-target ytd-rich-shelf-renderer[modernized-shelf-title*="Shorts"] {
        visibility: hidden !important;
      }
      html.hd-home-target:not(.hd-ready) .hd-controls {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateClasses() {
    if (isYouTubeHome()) {
      html.classList.add('hd-home-target');
    } else {
      html.classList.remove('hd-home-target');
    }
    html.classList.remove('hd-ready');
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[TubeFlow][prelude] updateClasses', {
        isHome: isYouTubeHome(),
        pathname: location.pathname
      });
    }
  }

  ensureStyle();
  updateClasses();
  document.addEventListener('yt-navigate-start', updateClasses);
})();
