/* ==========================================================
   Cloudflare Pages Function: /u/<handle>
   - Injects <title> and Open Graph / Twitter meta for the profile into the HTML
     so shares to Facebook, LINE, X, Messenger etc. show the correct name and photo
   - Set these variables in Cloudflare Pages > Settings > Environment variables:
       SUPABASE_URL       = https://xxxx.supabase.co
       SUPABASE_ANON_KEY  = (anon public key)
   ========================================================== */

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

async function fetchProfile(env, handle) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/profiles` +
    `?username=eq.${encodeURIComponent(handle)}&select=username,display_name,bio,avatar_url&limit=1`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      cf: { cacheTtl: 60, cacheEverything: false },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch (e) {
    return null;
  }
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const handle = String(params.handle || '').toLowerCase();
  const pageUrl = new URL(request.url);
  const origin = pageUrl.origin;

  if (!HANDLE_RE.test(handle)) {
    return Response.redirect(`${origin}/404.html`, 302);
  }

  const profile = await fetchProfile(env, handle);
  const shell = await env.ASSETS.fetch(new URL('/profile.html', origin));

  const name = profile ? (profile.display_name || profile.username) : 'Page not found';
  const desc = profile
    ? (profile.bio || `See all links from ${name} in one place`).replace(/\s+/g, ' ').slice(0, 160)
    : 'This profile was not found on Mon HipHop Bio';
  const title = profile ? `${name} | Mon HipHop` : 'Page not found | Mon HipHop';
  const image = profile && profile.avatar_url ? profile.avatar_url : `${origin}/img/logo-mark.png`;
  const pageLink = `${origin}/u/${handle}`;

  const meta = `
  <meta name="description" content="${esc(desc)}">
  ${profile ? '' : '<meta name="robots" content="noindex">'}
  <link rel="canonical" href="${esc(pageLink)}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="Mon HipHop Bio">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(pageLink)}">
  <meta property="og:image" content="${esc(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(image)}">`;

  const out = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('head', { element(el) { el.append(meta, { html: true }); } })
    .transform(shell);

  const body = await out.text();
  return new Response(body, {
    status: profile ? 200 : 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': profile ? 'public, max-age=60, s-maxage=300' : 'no-store',
      'x-robots-tag': profile ? 'index, follow' : 'noindex',
    },
  });
}
