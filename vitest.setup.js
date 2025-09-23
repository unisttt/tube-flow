global.chrome = {
  storage: {
    sync: {
      get: (_defaults, callback) => {
        if (typeof callback === 'function') {
          callback(_defaults || {});
        }
      },
      set: () => {}
    },
    onChanged: {
      addListener: () => {}
    }
  },
  runtime: {
    lastError: null,
    sendMessage: () => {},
    onMessage: {
      addListener: () => {}
    }
  }
};
