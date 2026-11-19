#!/usr/bin/env node
/**
 * Fork: obtain an Instapaper access token for "Save to Instapaper", once.
 *
 * Reads INSTAPAPER_CONSUMER_KEY, INSTAPAPER_CONSUMER_SECRET, INSTAPAPER_USERNAME
 * and INSTAPAPER_PASSWORD from the environment, trades the login for a token
 * (xAuth) and prints the two lines to put in the server's environment:
 *
 *   docker exec frirss node scripts/instapaper-token.js
 *
 * Then set INSTAPAPER_TOKEN / INSTAPAPER_TOKEN_SECRET and remove the username
 * and password: the server never needs them. Revoke the token from
 * Instapaper's settings (Connected apps) at any time.
 */
import { fetchAccessToken } from '../server-dist/instapaperOAuth.js';

const { INSTAPAPER_CONSUMER_KEY, INSTAPAPER_CONSUMER_SECRET, INSTAPAPER_USERNAME, INSTAPAPER_PASSWORD } = process.env;
if (!INSTAPAPER_CONSUMER_KEY || !INSTAPAPER_CONSUMER_SECRET || !INSTAPAPER_USERNAME) {
  console.error('Set INSTAPAPER_CONSUMER_KEY, INSTAPAPER_CONSUMER_SECRET, INSTAPAPER_USERNAME (and INSTAPAPER_PASSWORD if the account has one).');
  process.exit(2);
}

try {
  const { token, tokenSecret } = await fetchAccessToken(
    { consumerKey: INSTAPAPER_CONSUMER_KEY, consumerSecret: INSTAPAPER_CONSUMER_SECRET },
    INSTAPAPER_USERNAME,
    INSTAPAPER_PASSWORD ?? '',
  );
  console.log(`INSTAPAPER_TOKEN=${token}`);
  console.log(`INSTAPAPER_TOKEN_SECRET=${tokenSecret}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
