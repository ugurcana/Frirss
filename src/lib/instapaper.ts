import { useEffect, useState } from 'react';
import { getInstapaperStatus, saveToInstapaper } from '../api/backend';

/**
 * Fork: "Save to Instapaper". The server holds the account
 * (`server/routes/instapaper.ts`); the app only asks once whether it is set,
 * and hides the button when it is not.
 */

let status: Promise<boolean> | null = null;

export function instapaperEnabled(): Promise<boolean> {
  // A failed check is not remembered: the next mount asks again.
  status ??= Promise.resolve().then(() => getInstapaperStatus()).catch(() => { status = null; return false; });
  return status;
}

export function useInstapaperEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    void instapaperEnabled().then((v) => { if (live) setEnabled(v); });
    return () => { live = false; };
  }, []);
  return enabled;
}

export type InstapaperOutcome = 'saved' | 'badCredentials' | 'failed';

const inFlight = new Set<string>();

/** Saves `url`; `null` when the same URL is already being saved (a double press). */
export async function saveArticleToInstapaper(url: string, title?: string): Promise<InstapaperOutcome | null> {
  if (inFlight.has(url)) return null;
  inFlight.add(url);
  try {
    await saveToInstapaper(url, title);
    return 'saved';
  } catch (err) {
    const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    return code === 'bad_credentials' ? 'badCredentials' : 'failed';
  } finally {
    inFlight.delete(url);
  }
}
