(() => {
  const html = document.documentElement;
  if (!html) {
    return;
  }

  const isYouTubeHome = () => /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === '/';
  const isYouTubeWatch = () => /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname.startsWith('/watch');

  function ensureStyle() {
    if (document.getElementById('tube-flow-prehide')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'tube-flow-prehide';
    style.textContent = `
      html.hd-home-target:not(.hd-ready) ytd-rich-grid-renderer #contents :is(ytd-rich-item-renderer, yt-lockup-view-model, yt-lockup-renderer) {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents.hd-managed-root [data-tubeflow-tile="1"] {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents.hd-managed-root [data-tubeflow-tile="1"].hd-visible {
        visibility: visible !important;
        opacity: 1 !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents.hd-managed-root [data-tubeflow-tile="1"].hd-hidden {
        display: none !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents.hd-managed-root > * {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      html.hd-home-target ytd-rich-grid-renderer #contents.hd-managed-root > *.hd-visible {
        visibility: visible !important;
        opacity: 1 !important;
      }
      html.hd-home-target.hd-hide-shorts ytd-reel-shelf-renderer,
      html.hd-home-target.hd-hide-shorts ytd-rich-shelf-renderer[is-shorts],
      html.hd-home-target.hd-hide-shorts ytd-rich-shelf-renderer[modernized-shelf-title*="Shorts"] {
        visibility: hidden !important;
      }
      html.hd-home-target:not(.hd-ready) .hd-controls {
        display: none !important;
      }
      html.hd-watch-target ytd-watch-next-secondary-results-renderer #items > *,
      html.hd-watch-target #related ytd-watch-next-secondary-results-renderer #items > *,
      html.hd-watch-target #secondary ytd-watch-next-secondary-results-renderer #items > * {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      html.hd-watch-target ytd-watch-next-secondary-results-renderer #items > *.hd-hidden,
      html.hd-watch-target #related ytd-watch-next-secondary-results-renderer #items > *.hd-hidden,
      html.hd-watch-target #secondary ytd-watch-next-secondary-results-renderer #items > *.hd-hidden {
        display: none !important;
      }
      html.hd-watch-target.hd-watch-ready ytd-watch-next-secondary-results-renderer #items > *.hd-visible,
      html.hd-watch-target.hd-watch-ready #related ytd-watch-next-secondary-results-renderer #items > *.hd-visible,
      html.hd-watch-target.hd-watch-ready #secondary ytd-watch-next-secondary-results-renderer #items > *.hd-visible {
        visibility: visible !important;
        opacity: 1 !important;
      }
      html.hd-watch-target .ytp-endscreen-content,
      html.hd-watch-target .ytp-ce-element,
      html.hd-watch-target .ytp-ce-video,
      html.hd-watch-target .ytp-ce-covering,
      html.hd-watch-target .ytp-ce-expanding-overlay,
      html.hd-watch-target .ytp-upnext,
      html.hd-watch-target .ytp-autonav-endscreen-upnext-button,
      html.hd-watch-target .ytp-cards-button {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateClasses() {
    const home = isYouTubeHome();
    const watch = isYouTubeWatch();
    html.classList.toggle('hd-home-target', home);
    html.classList.toggle('hd-watch-target', watch);
    html.classList.remove('hd-ready');
    if (!watch) {
      html.classList.remove('hd-watch-ready');
    }
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[TubeFlow][prelude] updateClasses', {
        isHome: home,
        isWatch: watch,
        pathname: location.pathname
      });
    }
  }

  function applyHideShortsFlag(flag) {
    if (flag) {
      html.classList.add('hd-hide-shorts');
    } else {
      html.classList.remove('hd-hide-shorts');
    }
  }

  function loadInitialSettings() {
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      applyHideShortsFlag(true);
      return;
    }
    chrome.storage.sync.get({ hideShorts: true }, (items) => {
      applyHideShortsFlag(items?.hideShorts !== false);
    });
  }

  ensureStyle();
  updateClasses();
  loadInitialSettings();
  document.addEventListener('yt-navigate-start', updateClasses);
})();
