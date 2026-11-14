/* Public profile — profile.html (served at /u/<name> through functions/u/[handle].js) */
(function () {
  'use strict';
  var M = window.MON;
  var sb = M.sb, $ = M.$, esc = M.esc;
  M.showSetupBanner();

  function usernameFromUrl() {
    var m = window.location.pathname.match(/^\/u\/([^\/?#]+)/);
    var raw = m ? m[1] : new URLSearchParams(window.location.search).get('u') || '';
    try { raw = decodeURIComponent(raw); } catch (e) { return ''; }
    return raw.trim().toLowerCase();
  }

  function notFound() {
    $('#loading').classList.add('hidden');
    $('#notfound').classList.remove('hidden');
    document.title = 'Page not found | Mon HipHop';
  }

  function render(p, links) {
    var pageUrl = M.siteOrigin() + '/u/' + p.username;
    var name = p.display_name || p.username;

    document.title = name + ' | Mon HipHop';
    $('#avatar').innerHTML = p.avatar_url
      ? '<img src="' + esc(p.avatar_url) + '" alt="Profile photo of ' + esc(name) + '">'
      : esc(name.charAt(0).toUpperCase());
    $('#name').textContent = name;
    $('#user').textContent = '@' + p.username;
    $('#bio').textContent = p.bio || '';
    $('#bio').classList.toggle('hidden', !p.bio);

    var wrap = $('#links');
    wrap.innerHTML = '';
    links.forEach(function (l) {
      var info = M.hostInfo(l.url);
      var a = document.createElement('a');
      a.className = 'link-btn';
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML =
        '<span class="badge" style="background:' + info.color + '">' + esc(info.badge) + '</span>' +
        '<span class="t">' + esc(l.title) + '</span>' +
        '<span class="arrow" aria-hidden="true">›</span>';
      /* count the click without blocking the navigation */
      a.addEventListener('click', function () {
        try { sb.rpc('track_click', { p_link: l.id }); } catch (e) { /* counting is best-effort */ }
      });
      wrap.appendChild(a);
    });
    $('#links-empty').classList.toggle('hidden', links.length > 0);

    buildShare(pageUrl, name);
    $('#loading').classList.add('hidden');
    $('#profile').classList.remove('hidden');
  }

  var SHARE = [
    ['X', 'X', function (u, t) { return 'https://twitter.com/intent/tweet?url=' + enc(u) + '&text=' + enc(t); }],
    ['FB', 'Facebook', function (u) { return 'https://www.facebook.com/sharer/sharer.php?u=' + enc(u); }],
    ['LN', 'LINE', function (u) { return 'https://social-plugins.line.me/lineit/share?url=' + enc(u); }],
    ['WA', 'WhatsApp', function (u, t) { return 'https://wa.me/?text=' + enc(t + ' ' + u); }],
    ['TG', 'Telegram', function (u, t) { return 'https://t.me/share/url?url=' + enc(u) + '&text=' + enc(t); }],
    ['TH', 'Threads', function (u, t) { return 'https://www.threads.net/intent/post?text=' + enc(t + ' ' + u); }],
    ['@', 'Email', function (u, t) { return 'mailto:?subject=' + enc(t) + '&body=' + enc(u); }]
  ];
  function enc(s) { return encodeURIComponent(s); }

  function buildShare(url, name) {
    var text = 'See all links from ' + name;
    $('#share-url').value = url;
    var box = $('#share-icons');
    box.innerHTML = '';
    SHARE.forEach(function (s) {
      var a = document.createElement('a');
      a.href = s[2](url, text);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', 'Share to ' + s[1]);
      a.title = s[1];
      a.textContent = s[0];
      box.appendChild(a);
    });
    if (navigator.share) {
      var nb = document.createElement('button');
      nb.type = 'button';
      nb.setAttribute('aria-label', 'Share with apps on this device');
      nb.title = 'Share';
      nb.textContent = '⤴';
      nb.addEventListener('click', function () {
        navigator.share({ title: name, text: text, url: url }).catch(function () {});
      });
      box.appendChild(nb);
    }
    $('#copy').onclick = async function () {
      var msg = $('#share-msg');
      try {
        await navigator.clipboard.writeText(url);
        msg.textContent = 'Link copied';
      } catch (e) {
        $('#share-url').select();
        msg.textContent = 'Press Ctrl+C (or ⌘+C) to copy';
      }
    };
  }

  async function init() {
    var username = usernameFromUrl();
    if (!username || !/^[a-z0-9_]{3,30}$/.test(username)) return notFound();
    if (!sb) {
      $('#loading').textContent = 'Supabase is not configured (edit assets/js/config.js)';
      return;
    }
    var p = await sb.from('profiles').select('id,username,display_name,bio,avatar_url')
      .eq('username', username).maybeSingle();
    if (p.error || !p.data) return notFound();
    var l = await sb.from('links').select('id,title,url')
      .eq('profile_id', p.data.id).eq('active', true).order('position', { ascending: true });
    render(p.data, l.data || []);
  }

  init().catch(function () {
    $('#loading').textContent = 'Could not load this profile. Please try again.';
  });
})();
