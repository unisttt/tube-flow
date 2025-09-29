window.TubeFlow = window.TubeFlow || {};
window.TubeFlow.adapters = window.TubeFlow.adapters || {};

window.TubeFlow.adapters.home = {
  selectors: {
    root: 'ytd-rich-grid-renderer #contents',
    tile: 'ytd-rich-item-renderer',
    shortsShelves: [
      'ytd-reel-shelf-renderer',
      'ytd-rich-shelf-renderer[is-shorts]',
      'ytd-rich-shelf-renderer[modernized-shelf-title*="Shorts"]'
    ],
    watchLaterButtons: [
      'ytd-toggle-button-renderer[is-icon-button][aria-label*="後で見る"] button',
      'ytd-button-renderer[button-renderer][aria-label*="後で見る"] button',
      'ytd-toggle-button-renderer[is-icon-button][aria-label*="Watch later"] button',
      'ytd-button-renderer[button-renderer][aria-label*="Watch later"] button',
      'ytd-thumbnail-overlay-toggle-button-renderer[aria-label*="Watch later" i] button',
      'ytd-thumbnail-overlay-toggle-button-renderer[aria-label*="後で見る" i] button',
      'yt-button-shape[aria-label*="Watch later" i] #button',
      'yt-button-shape[aria-label*="後で見る" i] #button',
      'yt-button-shape[aria-label*="watch later" i] button',
      'tp-yt-paper-icon-button[aria-label*="Watch later" i]',
      'tp-yt-paper-icon-button[aria-label*="後で見る" i]'
    ],
    notInterestedButtons: [
      'yt-button-shape[aria-label*="興味なし" i] #button',
      'yt-button-shape[aria-label*="Not interested" i] #button',
      'tp-yt-paper-icon-button[aria-label*="興味なし" i]',
      'tp-yt-paper-icon-button[aria-label*="Not interested" i]',
      'button[aria-label*="興味なし" i]',
      'button[aria-label*="Not interested" i]'
    ]
  }
};
