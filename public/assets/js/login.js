/* Sign in / sign up / forgot / reset — login.html */
(function () {
  'use strict';
  var M = window.MON;
  var sb = M.sb, $ = M.$, $$ = M.$$, setMsg = M.setMsg;
  var msg = $('#msg');
  var params = new URLSearchParams(window.location.search);
  var isRecoveryLink = /type=recovery/.test(window.location.hash);
  var USER_RE = /^[a-z0-9_]{3,30}$/;

  M.showSetupBanner();

  var views = { in: $('#f-in'), up: $('#f-up'), forgot: $('#f-forgot'), reset: $('#f-reset') };
  var tabs = $$('#tabs [role="tab"]');
  var copy = {
    in: ['Welcome back', 'Sign in to manage your link page'],
    up: ['Create your link page', 'Free, takes less than a minute'],
    forgot: ['Forgot password?', 'Enter your email and we will send you a reset link'],
    reset: ['Set a new password', 'Enter your new password below']
  };

  function show(view) {
    Object.keys(views).forEach(function (k) { views[k].classList.toggle('hidden', k !== view); });
    $('#tabs').classList.toggle('hidden', view === 'forgot' || view === 'reset');
    tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === view)); });
    $('#auth-title').textContent = copy[view][0];
    $('#auth-sub').textContent = copy[view][1];
    setMsg(msg, '');
  }

  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.tab); }); });
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.go); }); });
  $$('[data-tab-go]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tabGo); }); });

  $$('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var input = document.getElementById(b.dataset.toggle);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  /* Password strength: 0–4 */
  function strength(p) {
    var s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
    return p ? Math.max(1, s) : 0;
  }
  var texts = ['', 'Very weak', 'Fair', 'Good', 'Strong'];
  $('#up-pass').addEventListener('input', function (e) {
    var lv = strength(e.target.value);
    var m = $('#meter');
    m.dataset.level = lv;
    $('#meter-text').textContent = e.target.value ? 'Strength: ' + texts[lv] : 'Use uppercase letters, numbers and symbols';
  });
  $('#rs-pass').addEventListener('input', function (e) {
    document.querySelector('#f-reset .meter').dataset.level = strength(e.target.value);
  });

  /* Username availability (debounced) */
  var hint = $('#up-user-hint');
  var userInput = $('#up-user');
  var timer = null, lastChecked = '';
  function setHint(cls, text) {
    hint.className = 'check-status ' + cls;
    hint.textContent = text;
  }
  userInput.addEventListener('input', function () {
    var v = userInput.value.trim().toLowerCase();
    userInput.value = v;
    clearTimeout(timer);
    if (!v) return setHint('wait', 'a–z, 0–9 and _, 3–30 characters');
    if (!USER_RE.test(v)) return setHint('bad', 'Only a–z, 0–9 and _ (3–30 characters)');
    setHint('wait', 'Checking…');
    timer = setTimeout(async function () {
      if (!sb) return;
      lastChecked = v;
      var r = await sb.rpc('is_username_available', { u: v });
      if (userInput.value.trim().toLowerCase() !== v) return;
      if (r.error) return setHint('wait', 'Could not check. Please try again.');
      setHint(r.data ? 'ok' : 'bad', r.data ? 'Username available ✓' : 'Username is taken or not allowed');
    }, 400);
  });

  function setBusy(form, busy, label) {
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = busy;
    if (label) btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.textContent = busy ? 'Please wait…' : (btn.dataset.label || btn.textContent);
  }

  function requireConfig() {
    if (!sb) { setMsg(msg, 'Supabase is not configured (assets/js/config.js)', 'err'); return false; }
    return true;
  }

  function goDashboard() { window.location.replace('/dashboard.html'); }

  /* SIGN IN */
  $('#f-in').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!requireConfig()) return;
    var email = $('#in-email').value.trim();
    var pass = $('#in-pass').value;
    if (!email || !pass) return setMsg(msg, 'Please enter your email and password', 'err');
    setBusy(this, true);
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    setBusy(this, false);
    if (r.error) return setMsg(msg, M.errText(r.error), 'err');
    goDashboard();
  });

  /* SIGN UP */
  $('#f-up').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!requireConfig()) return;
    var username = userInput.value.trim().toLowerCase();
    var name = $('#up-name').value.trim();
    var email = $('#up-email').value.trim();
    var pass = $('#up-pass').value;
    if (!USER_RE.test(username)) return setMsg(msg, 'Invalid username (a–z, 0–9, _; 3–30 characters)', 'err');
    if (pass.length < 8) return setMsg(msg, 'Password must be at least 8 characters', 'err');
    if (!email) return setMsg(msg, 'Please enter your email', 'err');

    setBusy(this, true);
    var avail = await sb.rpc('is_username_available', { u: username });
    if (!avail.error && avail.data === false) {
      setBusy(this, false);
      setHint('bad', 'Username is taken or not allowed');
      return setMsg(msg, 'That username is taken. Please choose another.', 'err');
    }
    var r = await sb.auth.signUp({
      email: email,
      password: pass,
      options: {
        data: { username: username, display_name: name || username },
        emailRedirectTo: M.siteOrigin() + '/dashboard.html'
      }
    });
    setBusy(this, false);
    if (r.error) return setMsg(msg, M.errText(r.error), 'err');
    if (r.data && r.data.session) return goDashboard();

    /* email confirmation is ON in Supabase: ask the visitor to check their inbox */
    this.reset();
    $('#meter').dataset.level = 0;
    setHint('wait', 'a–z, 0–9 and _, 3–30 characters');
    setMsg(msg, 'Account created! We sent a confirmation link to ' + email + '. Click the link in the email to get started.', 'ok');
  });

  /* FORGOT */
  $('#f-forgot').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!requireConfig()) return;
    var email = $('#fg-email').value.trim();
    if (!email) return setMsg(msg, 'Please enter your email', 'err');
    setBusy(this, true);
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: M.siteOrigin() + '/login.html' });
    setBusy(this, false);
    if (r.error) return setMsg(msg, M.errText(r.error), 'err');
    setMsg(msg, 'If an account exists for this email, we have sent a reset link (check your spam folder too).', 'ok');
  });

  /* RESET */
  $('#f-reset').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!requireConfig()) return;
    var pass = $('#rs-pass').value;
    if (pass.length < 8) return setMsg(msg, 'Password must be at least 8 characters', 'err');
    setBusy(this, true);
    var r = await sb.auth.updateUser({ password: pass });
    setBusy(this, false);
    if (r.error) return setMsg(msg, M.errText(r.error), 'err');
    setMsg(msg, 'Password updated. Taking you to your dashboard…', 'ok');
    setTimeout(goDashboard, 1200);
  });

  /* Start state */
  function init() {
    if (!sb) return;
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') show('reset');
    });
    if (isRecoveryLink) { show('reset'); return; }
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) return goDashboard();
    });
  }

  var mode = params.get('mode');
  show(mode === 'up' ? 'up' : 'in');
  init();
})();
