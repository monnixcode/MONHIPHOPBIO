/* Shared helpers for every page (loaded after config.js and supabase-js) */
(function () {
  'use strict';
  var cfg = window.MON_CONFIG || {};
  var placeholder = !cfg.SUPABASE_URL || /YOUR-PROJECT/i.test(cfg.SUPABASE_URL) ||
                    !cfg.SUPABASE_ANON_KEY || /YOUR-ANON/i.test(cfg.SUPABASE_ANON_KEY);
  var sb = null;
  if (!placeholder && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (type ? ' msg-' + type : '') + (text ? '' : ' hidden');
  }

  /* Normalise a user-typed URL: add https:// if missing, reject anything else */
  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
      var u = new URL(s);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      if (!u.hostname.includes('.')) return null;
      return u.href;
    } catch (e) { return null; }
  }

  /* Brand badge for well-known hosts (no third-party icon files needed) */
  var HOSTS = [
    [/youtube\.com|youtu\.be/, 'YouTube', 'YT', '#ff3d3d'],
    [/instagram\.com/, 'Instagram', 'IG', '#e1306c'],
    [/tiktok\.com/, 'TikTok', 'TT', '#25f4ee'],
    [/spotify\.com/, 'Spotify', 'SP', '#1db954'],
    [/music\.apple\.com/, 'Apple Music', 'AM', '#fa243c'],
    [/soundcloud\.com/, 'SoundCloud', 'SC', '#ff7a1a'],
    [/facebook\.com|fb\.com/, 'Facebook', 'FB', '#1877f2'],
    [/(^|\.)x\.com|twitter\.com/, 'X', 'X', '#e7e9ea'],
    [/line\.me/, 'LINE', 'LN', '#06c755'],
    [/threads\.net/, 'Threads', 'TH', '#e7e9ea'],
    [/t\.me|telegram/, 'Telegram', 'TG', '#2aabee']
  ];
  function hostInfo(url) {
    var host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
    for (var i = 0; i < HOSTS.length; i++) {
      if (HOSTS[i][0].test(host)) return { label: HOSTS[i][1], badge: HOSTS[i][2], color: HOSTS[i][3], host: host };
    }
    return { label: host || 'Link', badge: '↗', color: '#d4a64a', host: host };
  }

  function errText(err) {
    var m = (err && err.message) || '';
    var map = {
      'Invalid login credentials': 'Incorrect email or password',
      'Email not confirmed': 'Email not confirmed yet. Please check your inbox.',
      'User already registered': 'This email is already registered',
      'Password should be at least 6 characters.': 'Password must be at least 8 characters',
      'Signups not allowed for this instance': 'Sign-ups are temporarily closed',
      'New password should be different from the old password.': 'New password must be different from the old one',
      'username_invalid': 'Username must be 3–30 characters: a–z, 0–9 or _, and not reserved',
      'link_limit': 'You can add up to 30 links',
      'Failed to fetch': 'Could not reach the server. Please try again.'
    };
    if (err && err.code === '23505') return 'This username is already taken';
    if (err && err.status === 429) return 'Please try again later (too many requests)';
    for (var k in map) if (m.indexOf(k) !== -1) return map[k];
    return m || 'Something went wrong. Please try again.';
  }

  function showSetupBanner() {
    if (!placeholder) return;
    var b = document.createElement('div');
    b.className = 'setup-banner';
    b.setAttribute('role', 'alert');
    b.innerHTML = 'Supabase is not configured yet — set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in the file <code>assets/js/config.js</code>';
    document.body.insertBefore(b, document.body.firstChild);
  }

  function siteOrigin() {
    return (cfg.SITE_URL && !/your-site/.test(cfg.SITE_URL)) ? cfg.SITE_URL.replace(/\/$/, '') : window.location.origin;
  }

  window.MON = {
    sb: sb, ready: !!sb, cfg: cfg,
    esc: esc, $: $, $$: $$, setMsg: setMsg,
    normalizeUrl: normalizeUrl, hostInfo: hostInfo,
    errText: errText, showSetupBanner: showSetupBanner, siteOrigin: siteOrigin
  };
})();
