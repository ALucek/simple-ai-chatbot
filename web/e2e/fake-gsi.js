// Minimal GSI stub for e2e: requestCode() fires callback with a sentinel code.
window.google = {
  accounts: {
    oauth2: {
      initCodeClient(cfg) {
        return {
          requestCode() {
            const email = window.__E2E_EMAIL__ || 'e2e@gmail.com';
            cfg.callback({ code: 'e2e:' + email });
          },
        };
      },
    },
  },
};
