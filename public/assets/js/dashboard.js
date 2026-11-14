/* Artist dashboard — dashboard.html */
(function () {
  'use strict';
  var M = window.MON;
  var sb = M.sb, $ = M.$, esc = M.esc, setMsg = M.setMsg;
  var MAX_LINKS = 30;
  var USER_RE = /^[a-z0-9_]{3,30}$/;
  var AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  var AVATAR_MAX = 2 * 1024 * 1024;
  var state = { user: null, profile: null, links: [] };
  var msgEl = $('#dash-msg');

  M.showSetupBanner();
  if (!sb) {
    $('#loading').textContent = 'Supabase is not configured (edit assets/js/config.js)';
    return;
  }

  function flash(text, type) { setMsg(msgEl, text, type); if (text && type === 'ok') setTimeout(function () { setMsg(msgEl, ''); }, 2600); }
  function publicUrl() { return M.siteOrigin() + '/u/' + state.profile.username; }
  function hostOf(url) { return M.hostInfo(url).host || url; }

  /* ---------- boot ---------- */
  async function boot() {
    var s = await sb.auth.getSession();
    var session = s.data && s.data.session;
    if (!session) { window.location.replace('/login.html'); return; }
    state.user = session.user;
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'SIGNED_OUT') window.location.replace('/login.html');
    });
    await loadAll();
  }

  async function loadAll() {
    var p = await sb.from('profiles').select('id,username,display_name,bio,avatar_url')
      .eq('id', state.user.id).maybeSingle();
    if (p.error || !p.data) {
      $('#loading').textContent = 'Could not load your profile. Please refresh the page.';
      return;
    }
    state.profile = p.data;
    var l = await sb.from('links').select('id,title,url,position,active,clicks')
      .eq('profile_id', state.user.id).order('position', { ascending: true });
    state.links = l.data || [];
    $('#loading').classList.add('hidden');
    $('#dash').classList.remove('hidden');
    renderProfile();
    renderLinks();
    renderStats();
  }

  /* ---------- render ---------- */
  function avatarHtml(p) {
    if (p.avatar_url) return '<img src="' + esc(p.avatar_url) + '" alt="">';
    return esc((p.display_name || p.username || 'M').charAt(0).toUpperCase());
  }

  function renderProfile() {
    var p = state.profile;
    $('#hello').textContent = 'Hello, ' + (p.display_name || p.username);
    $('#av-preview').innerHTML = avatarHtml(p);
    $('#p-name').value = p.display_name || '';
    $('#p-user').value = p.username;
    $('#p-bio').value = p.bio || '';
    $('#bio-count').textContent = (p.bio || '').length;
    var url = publicUrl();
    $('#public-url').href = url;
    $('#public-url').textContent = url.replace(/^https?:\/\//, '');
    $('#view-link').href = '/u/' + p.username;
  }

  function renderStats() {
    var clicks = state.links.reduce(function (n, l) { return n + (l.clicks || 0); }, 0);
    var active = state.links.filter(function (l) { return l.active; }).length;
    $('#st-clicks').textContent = clicks.toLocaleString('th-TH');
    $('#st-active').textContent = active;
    $('#st-total').textContent = state.links.length;
  }

  function renderLinks() {
    var ul = $('#link-list');
    ul.innerHTML = '';
    state.links.forEach(function (l, i) { ul.appendChild(linkItem(l, i)); });
    $('#link-empty').classList.toggle('hidden', state.links.length > 0);
    $('#link-count').textContent = state.links.length + '/' + MAX_LINKS;
    $('#f-link').querySelector('button[type="submit"]').disabled = state.links.length >= MAX_LINKS;
    renderStats();
  }

  function linkItem(l, i) {
    var li = document.createElement('li');
    li.className = 'link-item' + (l.active ? '' : ' is-off');
    li.dataset.id = l.id;
    li.innerHTML =
      '<div class="meta">' +
        '<div class="title">' + esc(l.title) + '</div>' +
        '<div class="url">' + esc(hostOf(l.url)) + '</div>' +
        '<div class="clicks">' + (l.clicks || 0).toLocaleString('en-US') + ' clicks' + (l.active ? '' : ' · hidden') + '</div>' +
      '</div>' +
      '<div class="actions">' +
        '<label class="switch" title="Show / hide"><input type="checkbox" data-act="toggle" ' + (l.active ? 'checked' : '') + ' aria-label="Show this link"><span></span></label>' +
        '<button class="btn btn-icon btn-ghost" type="button" data-act="up" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn btn-icon btn-ghost" type="button" data-act="down" aria-label="Move down"' + (i === state.links.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn btn-sm btn-ghost" type="button" data-act="edit">Edit</button>' +
        '<button class="btn btn-sm btn-danger" type="button" data-act="del">Delete</button>' +
      '</div>';
    li.addEventListener('click', onLinkClick);
    li.addEventListener('change', onLinkClick);
    return li;
  }

  function findLink(id) { return state.links.find(function (l) { return l.id === id; }); }

  function onLinkClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    /* the switch fires both click and change: handle it once, on change */
    if (btn.tagName === 'INPUT' ? e.type !== 'change' : e.type !== 'click') return;
    var li = btn.closest('.link-item');
    var link = findLink(li.dataset.id);
    if (!link) return;
    var act = btn.dataset.act;
    if (act === 'toggle') return toggleActive(link, btn.checked);
    if (act === 'up') return move(link, -1);
    if (act === 'down') return move(link, 1);
    if (act === 'edit') return openEdit(li, link);
    if (act === 'del') return removeLink(link);
  }

  /* ---------- link actions ---------- */
  async function toggleActive(link, on) {
    var r = await sb.from('links').update({ active: on }).eq('id', link.id);
    if (r.error) { flash(M.errText(r.error), 'err'); return renderLinks(); }
    link.active = on;
    renderLinks();
  }

  async function move(link, dir) {
    var idx = state.links.indexOf(link);
    var other = state.links[idx + dir];
    if (!other) return;
    state.links[idx] = other;
    state.links[idx + dir] = link;
    var a = await sb.from('links').update({ position: idx + dir }).eq('id', link.id);
    var b = await sb.from('links').update({ position: idx }).eq('id', other.id);
    if (a.error || b.error) flash('Could not reorder. Please try again.', 'err');
    renderLinks();
  }

  async function removeLink(link) {
    if (!window.confirm('Delete the link "' + link.title + '"?\n(Its click statistics will also be removed.)')) return;
    var r = await sb.from('links').delete().eq('id', link.id);
    if (r.error) return flash(M.errText(r.error), 'err');
    state.links = state.links.filter(function (l) { return l !== link; });
    renderLinks();
    flash('Link deleted', 'ok');
  }

  function openEdit(li, link) {
    li.classList.add('is-editing');
    li.innerHTML =
      '<form class="link-edit" novalidate>' +
        '<div class="field" style="margin:0"><label>Button label</label><input class="input" name="title" maxlength="80" value="' + esc(link.title) + '"></div>' +
        '<div class="field" style="margin:0"><label>Link (URL)</label><input class="input" name="url" inputmode="url" spellcheck="false" value="' + esc(link.url) + '"></div>' +
        '<div class="msg hidden" role="alert"></div>' +
        '<div class="inline-actions"><button type="button" class="btn btn-sm btn-ghost" data-cancel>Cancel</button>' +
        '<button type="submit" class="btn btn-sm btn-gold">Save</button></div>' +
      '</form>';
    var form = li.querySelector('form');
    var err = form.querySelector('.msg');
    form.querySelector('[data-cancel]').addEventListener('click', function () { renderLinks(); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var title = form.title.value.trim();
      var url = M.normalizeUrl(form.url.value);
      if (!title) return setMsg(err, 'Please enter a button label', 'err');
      if (!url) return setMsg(err, 'Invalid link (it must start with https://)', 'err');
      var r = await sb.from('links').update({ title: title, url: url }).eq('id', link.id)
        .select('id,title,url,position,active,clicks').single();
      if (r.error) return setMsg(err, M.errText(r.error), 'err');
      Object.assign(link, r.data);
      renderLinks();
      flash('Link saved', 'ok');
    });
  }

  $('#f-link').addEventListener('submit', async function (e) {
    e.preventDefault();
    var title = $('#l-title').value.trim();
    var url = M.normalizeUrl($('#l-url').value);
    if (state.links.length >= MAX_LINKS) return flash('You can add up to ' + MAX_LINKS + ' links', 'err');
    if (!title) return flash('Please enter a button label', 'err');
    if (!url) return flash('Invalid link (it must start with https://)', 'err');
    var pos = state.links.reduce(function (m, l) { return Math.max(m, l.position + 1); }, 0);
    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    var r = await sb.from('links').insert({ profile_id: state.user.id, title: title, url: url, position: pos, active: true })
      .select('id,title,url,position,active,clicks').single();
    btn.disabled = false;
    if (r.error) return flash(M.errText(r.error), 'err');
    state.links.push(r.data);
    this.reset();
    renderLinks();
    flash('Link added', 'ok');
    $('#l-title').focus();
  });

  /* ---------- profile ---------- */
  var userInput = $('#p-user');
  var userHint = $('#p-user-hint');
  var timer = null;
  userInput.addEventListener('input', function () {
    var v = userInput.value.trim().toLowerCase();
    userInput.value = v;
    clearTimeout(timer);
    if (v === state.profile.username) { userHint.className = 'check-status wait'; userHint.textContent = 'This is your current username'; return; }
    if (!USER_RE.test(v)) { userHint.className = 'check-status bad'; userHint.textContent = 'Only a–z, 0–9 and _ (3–30 characters)'; return; }
    userHint.className = 'check-status wait'; userHint.textContent = 'Checking…';
    timer = setTimeout(async function () {
      var r = await sb.rpc('is_username_available', { u: v });
      if (userInput.value.trim().toLowerCase() !== v) return;
      if (r.error) { userHint.className = 'check-status wait'; userHint.textContent = 'Could not check. Please try again.'; return; }
      userHint.className = 'check-status ' + (r.data ? 'ok' : 'bad');
      userHint.textContent = r.data ? 'Username available ✓' : 'Username is taken or not allowed';
    }, 400);
  });

  $('#p-bio').addEventListener('input', function (e) {
    $('#bio-count').textContent = e.target.value.length;
  });

  $('#f-profile').addEventListener('submit', async function (e) {
    e.preventDefault();
    var name = $('#p-name').value.trim().slice(0, 60);
    var bio = $('#p-bio').value.trim().slice(0, 280);
    var uname = userInput.value.trim().toLowerCase();
    if (!USER_RE.test(uname)) return flash('Invalid username (a–z, 0–9, _; 3–30 characters)', 'err');
    if (uname !== state.profile.username) {
      var chk = await sb.rpc('is_username_available', { u: uname });
      if (chk.error || !chk.data) return flash('That username is taken. Please choose another.', 'err');
    }
    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    var r = await sb.from('profiles').update({ display_name: name, bio: bio, username: uname })
      .eq('id', state.user.id).select('id,username,display_name,bio,avatar_url').single();
    btn.disabled = false;
    if (r.error) return flash(M.errText(r.error), 'err');
    state.profile = r.data;
    renderProfile();
    flash('Profile saved', 'ok');
  });

  $('#av-file').addEventListener('change', async function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES[file.type]) return flash('Only JPG, PNG or WebP files are allowed', 'err');
    if (file.size > AVATAR_MAX) return flash('File is larger than 2 MB', 'err');
    flash('Uploading photo…');
    var path = state.user.id + '/avatar-' + Date.now() + '.' + AVATAR_TYPES[file.type];
    var up = await sb.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (up.error) return flash('Photo upload failed: ' + M.errText(up.error), 'err');
    var url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    var oldUrl = state.profile.avatar_url;
    var r = await sb.from('profiles').update({ avatar_url: url }).eq('id', state.user.id)
      .select('id,username,display_name,bio,avatar_url').single();
    if (r.error) return flash(M.errText(r.error), 'err');
    state.profile = r.data;
    renderProfile();
    flash('Profile photo updated', 'ok');
    removeOldAvatar(oldUrl);
  });

  function removeOldAvatar(url) {
    if (!url) return;
    var marker = '/storage/v1/object/public/avatars/';
    var i = url.indexOf(marker);
    if (i < 0) return;
    var path = decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
    if (path.indexOf(state.user.id + '/') !== 0) return;
    sb.storage.from('avatars').remove([path]);
  }

  /* ---------- share ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (err) {}
      t.remove();
      return ok;
    }
  }

  $('#copy-url').addEventListener('click', async function () {
    var ok = await copyText(publicUrl());
    flash(ok ? 'Link copied' : 'Copy failed. Please copy it manually.', ok ? 'ok' : 'err');
  });

  $('#native-share').addEventListener('click', async function () {
    var data = { title: state.profile.display_name || state.profile.username, text: 'See all my links here', url: publicUrl() };
    if (navigator.share) {
      try { await navigator.share(data); } catch (e) { /* user cancelled */ }
    } else {
      var ok = await copyText(publicUrl());
      flash(ok ? 'This browser does not support sharing, so the link was copied instead' : 'Copy failed', ok ? 'ok' : 'err');
    }
  });

  $('#logout').addEventListener('click', async function () {
    await sb.auth.signOut();
    window.location.replace('/login.html');
  });

  boot().catch(function () {
    $('#loading').textContent = 'Something went wrong. Please refresh the page.';
  });
})();
