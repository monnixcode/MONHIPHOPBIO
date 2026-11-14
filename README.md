<div align="center">

<img src="public/img/logo-gold.png" alt="Mon HipHop" width="260">

# Mon HipHop Bio

**A personal link page for artists — bring your music, videos, social profiles and every other channel into one link.**

[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20DB-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Plain HTML](https://img.shields.io/badge/Stack-HTML%20%2F%20CSS%20%2F%20JS-d4a64a)](#tech-stack)
[![License](https://img.shields.io/badge/License-All%20rights%20reserved-lightgrey)](#license)

</div>

---

## Overview

Mon HipHop Bio is a **Link-in-Bio** web app for artists. After signing up, each user gets a public profile at a personal handle, such as `/u/yourname`. They can add links right away, every link's clicks are counted, and the profile can be shared to major social networks with a rich preview when the link is pasted.

## Features

| Area | Details |
| --- | --- |
| **Accounts** | Sign up and sign in with email and password, email confirmation, and password reset |
| **Unique username** | Real-time availability check. Allowed characters: `a-z`, `0-9`, `_`; 3–30 characters |
| **Profile** | Display name, bio (up to 280 characters), profile photo (JPG / PNG / WebP, up to 2 MB) |
| **Link management** | Add, edit, delete, reorder, and show/hide links (up to 30) |
| **Automatic icons** | Recognises popular domains such as YouTube, Spotify, Instagram, TikTok, Apple Music and SoundCloud |
| **Statistics** | Total clicks and clicks per link |
| **Profile sharing** | Facebook, X, LINE, WhatsApp, Telegram, Threads, email, copy link, and the device's native share sheet |
| **Social preview** | Open Graph and Twitter Card tags show the name, bio and photo when the link is pasted |
| **Security** | Row Level Security on every table; `clicks` can only change through a defined function; `javascript:` URLs are rejected |

## Tech Stack

- **Frontend**: plain HTML, CSS and JavaScript with no build step (mobile-first, dark theme with gold accents)
- **Backend**: [Supabase](https://supabase.com) for Auth, Postgres and Storage
- **Hosting**: [Cloudflare Pages](https://pages.cloudflare.com) with a Pages Function for `/u/<name>`

## Project Structure

```
mon-hiphop-bio/
├── public/                       ← folder published by Cloudflare
│   ├── index.html                ← landing page
│   ├── login.html                ← sign in / sign up / forgot password
│   ├── dashboard.html            ← artist dashboard
│   ├── profile.html              ← public profile (served for /u/<name>)
│   ├── 404.html
│   ├── _headers                  ← Cloudflare security headers
│   ├── robots.txt
│   ├── img/                      ← logos and favicon
│   └── assets/
│       ├── css/style.css
│       └── js/
│           ├── config.js         ← Supabase settings (edit here)
│           ├── common.js         ← shared client and helpers
│           ├── login.js
│           ├── dashboard.js
│           └── profile.js
├── functions/
│   └── u/[handle].js             ← Pages Function: adds OG meta for /u/<name>
├── supabase/
│   └── schema.sql                ← tables, RLS, triggers, RPCs, storage (run once)
├── wrangler.toml
├── .gitignore
└── README.md
```

## Setup

### 1. Create a Supabase project

1. Create a new project at [supabase.com](https://supabase.com)
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and click **Run**
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public key**

> ⚠️ Never put the `service_role` key in your code or on the website.

### 2. Configure Authentication

- **Authentication → URL Configuration**
  - **Site URL**: your site's domain, e.g. `https://mon-hiphop.pages.dev`
  - **Redirect URLs**: add `https://mon-hiphop.pages.dev/*`
- **Authentication → Providers → Email**: enable it, and choose whether email confirmation is required

### 3. Add your keys to the code

Edit `public/assets/js/config.js`:

```js
window.MON_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  SITE_URL: 'https://mon-hiphop.pages.dev'
};
```

### 4. Deploy to Cloudflare Pages

> ⚠️ Drag-and-drop uploads (Upload assets) only serve static files. They do not run `functions/`, so `/u/<name>` will not get share previews. Use option A or B below.

**Option A — Connect GitHub (recommended)**
1. Push the code to GitHub
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**
3. Configure the build:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. Every push will deploy automatically

**Option B — Wrangler CLI (upload from your machine)**
```bash
cd mon-hiphop-bio
npx wrangler pages deploy public --project-name=mon-hiphop-bio
```
This command also picks up the `functions/` folder next to `public/`.

### 5. Set Environment Variables (for the Pages Function)

In your Pages project, go to **Settings → Environment variables** and add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_ANON_KEY` | Your anon public key |

The function uses these to fetch the name and photo for the share preview. Without them, profile pages still work, but shared links show the logo instead of the artist's photo.

## Upload to GitHub from Termux (Android)

```bash
# 1. install tools (once)
pkg update && pkg install git gh unzip

# 2. allow access to phone storage (once) and go to the unzipped project
termux-setup-storage
cd ~/storage/downloads/mon-hiphop-bio

# 3. initialise git and make the first commit
git init -b main
git add .
git commit -m "Initial commit: Mon HipHop Bio"

# 4. log in to GitHub and create the repository, then push
gh auth login
gh repo create mon-hiphop-bio --public --source=. --remote=origin --push
```

Later updates: `git add . && git commit -m "Update" && git push`

## Local Development

To run the site locally with the Pages Function included:

```bash
npx wrangler pages dev public
```

> Note: `/u/<name>` only works through the Pages Function, so use `wrangler pages dev` rather than a plain static server.

## Security Notes

- The **anon key** is visible in the browser by design in Supabase. Security relies entirely on **RLS**, so make sure `schema.sql` runs in full.
- `clicks` cannot be changed directly from the browser. It is incremented only through `track_click()`.
- Links that are not `http://` or `https://` are rejected both in the browser and in the database.
- `dashboard.html` and `login.html` are marked `noindex`, so search engines will not list them.

## Troubleshooting

| Symptom | Common cause | Fix |
| --- | --- | --- |
| "Supabase is not configured" banner | `config.js` not updated | Enter the correct URL and anon key |
| No sign-up email arrives | Email provider not set up, or the email is in spam | Check Authentication → Providers and SMTP settings |
| Confirmation link points to `localhost` | Site URL is still the default | Update the Site URL in Supabase |
| Shared links show no photo or name | Environment variables not set, or the site was deployed without the Pages Function | Complete step 5 and redeploy |
| Photo upload fails | File is over 2 MB or not JPG/PNG/WebP | Resize the image and try again |
| Username shows as taken but seems free | The name is reserved, for example `admin` | Choose another name |

## License

© 2026 Mon HipHop. All rights reserved.
