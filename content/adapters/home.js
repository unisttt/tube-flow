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
      'ytd-button-renderer[button-renderer][aria-label*="Watch later"] button'
    ]
  }
};
