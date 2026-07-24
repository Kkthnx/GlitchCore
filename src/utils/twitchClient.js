const logger = require('./logger');

// Minimal Twitch Helix client using the app (client-credentials) token flow.
// Uses the global fetch (Node 18+). No streamer OAuth needed — we only read
// public live-stream status.

let tokenCache = { token: null, expiresAt: 0 };

function isConfigured() {
    return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

async function getAppToken() {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials',
        }),
    });
    if (!res.ok) throw new Error(`Twitch token request failed (${res.status})`);
    const json = await res.json();
    tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return tokenCache.token;
}

async function helix(pathAndQuery) {
    const token = await getAppToken();
    const res = await fetch(`https://api.twitch.tv/helix/${pathAndQuery}`, {
        headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { tokenCache = { token: null, expiresAt: 0 }; } // force refresh next call
    if (!res.ok) throw new Error(`Twitch helix ${res.status} (${pathAndQuery})`);
    return res.json();
}

/** Look up a Twitch user by login. Returns the user object or null. */
async function getUser(login) {
    const json = await helix(`users?login=${encodeURIComponent(login)}`);
    return json.data?.[0] || null;
}

/** Fetch currently-live streams for the given logins (batched by 100). */
async function getLiveStreams(logins) {
    if (!logins.length) return [];
    const out = [];
    for (let i = 0; i < logins.length; i += 100) {
        const batch = logins.slice(i, i + 100).map(l => `user_login=${encodeURIComponent(l)}`).join('&');
        try {
            const json = await helix(`streams?${batch}`);
            out.push(...(json.data || []));
        } catch (err) {
            logger.error('[TWITCH] getLiveStreams batch failed:', err.message);
        }
    }
    return out;
}

/** Normalize user input (URL, @handle, or bare login) to a bare login. */
function normalizeLogin(input) {
    return String(input).trim().toLowerCase()
        .replace(/^https?:\/\/(www\.)?twitch\.tv\//, '')
        .replace(/^@/, '')
        .replace(/\/.*$/, '');
}

module.exports = { isConfigured, getUser, getLiveStreams, normalizeLogin };
