// Minimal stand-in for Google Identity Services, served in place of the real
// GSI script during e2e. Implements only the slice the login page uses.
window.google = {
  accounts: {
    id: {
      _cb: null,
      initialize(cfg) {
        this._cb = cfg.callback;
      },
      renderButton(el) {
        const btn = document.createElement('button');
        btn.textContent = 'Sign in with Google';
        btn.onclick = () => {
          const email = window.__E2E_EMAIL__ || 'e2e@gmail.com';
          window.google.accounts.id._cb({ credential: 'e2e:' + email });
        };
        el.appendChild(btn);
      },
    },
  },
};
