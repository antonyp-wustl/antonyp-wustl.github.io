// "Log in with GitHub" for the Write page (assets/write.js).
//
// GitHub only hands out login tokens to a server that knows the app's secret, and the
// site itself is static, so this small Cloudflare Worker does that one step:
//
//   /login     sends you to GitHub to approve the "antonyp-write" GitHub App
//   /callback  GitHub sends you back here; the code is swapped for a token, and you
//              land on SITE/write with the token in the address's #fragment (which
//              browsers never send to any server), where the editor picks it up
//   /refresh   the editor trades an expiring token for a fresh one (only SITE may ask)
//
// The token can only do what the GitHub App allows (edit this one repository, read its
// build status) and only for accounts that can already push to it. Nothing is stored here.
//
// Settings (Cloudflare → the worker → Settings → Variables and Secrets):
//   GITHUB_CLIENT_ID      the GitHub App's Client ID
//   GITHUB_CLIENT_SECRET  a client secret generated on the GitHub App page (type: Secret)
//   SITE                  https://antonyp.com

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const site = (env.SITE || '').replace(/\/$/, '');
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !site) {
      return text('The login helper is missing a setting (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET or SITE).', 500);
    }
    const back = (fragment) => new Response(null, {
      status: 302,
      headers: {
        Location: `${site}/write#${fragment}`,
        'Set-Cookie': 'am_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });

    if (url.pathname === '/login') {
      const state = crypto.randomUUID();
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      gh.searchParams.set('redirect_uri', `${url.origin}/callback`);
      gh.searchParams.set('state', state);
      return new Response(null, {
        status: 302,
        headers: {
          Location: gh.toString(),
          // Ties the callback to this browser, so nobody can log you in to their own session.
          'Set-Cookie': `am_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (url.pathname === '/callback') {
      const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)am_state=([^;]+)/)?.[1];
      if (url.searchParams.get('error')) return back('login-error=' + encodeURIComponent(url.searchParams.get('error_description') || 'GitHub didn’t log you in.'));
      if (!cookie || cookie !== url.searchParams.get('state')) return back('login-error=' + encodeURIComponent('The login took too long or came from somewhere else. Try again.'));
      const t = await exchange(env, { code: url.searchParams.get('code'), redirect_uri: `${url.origin}/callback` });
      if (!t.access_token) return back('login-error=' + encodeURIComponent(t.error_description || 'GitHub didn’t give a token. Try again.'));
      return back('login=' + encodeURIComponent(new URLSearchParams(tokens(t)).toString()));
    }

    if (url.pathname === '/refresh') {
      const cors = { 'Access-Control-Allow-Origin': site, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST' || request.headers.get('Origin') !== site) return text('Not allowed.', 403, cors);
      let refresh = '';
      try { refresh = (await request.json()).refresh; } catch (_) { /* not JSON */ }
      if (!refresh) return text('No refresh token.', 400, cors);
      const t = await exchange(env, { grant_type: 'refresh_token', refresh_token: refresh });
      if (!t.access_token) return json({ error: t.error_description || t.error || 'refresh failed' }, 401, cors);
      return json(tokens(t), 200, cors);
    }

    return text('This is the login helper for the Write page. Nothing to see here.', 404);
  },
};

async function exchange(env, params) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'antonyp-write-login' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...params }),
  });
  try { return await res.json(); } catch (_) { return { error_description: `GitHub answered ${res.status}.` }; }
}

// Only what the editor needs; lifetimes are in seconds.
const tokens = (t) => ({
  token: t.access_token,
  refresh: t.refresh_token || '',
  expires_in: String(t.expires_in || ''),
  refresh_expires_in: String(t.refresh_token_expires_in || ''),
});
const text = (body, status, headers = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
