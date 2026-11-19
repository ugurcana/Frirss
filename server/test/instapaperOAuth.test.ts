import { describe, it, expect } from 'vitest';
import { authorizationHeader, percentEncode, formBody } from '../instapaperOAuth.js';

describe('instapaperOAuth', () => {
  it('percent-encodes as RFC 3986', () => {
    expect(percentEncode("Ladies + Gentlemen!*'()")).toBe('Ladies%20%2B%20Gentlemen%21%2A%27%28%29');
    expect(formBody({ a: 'x y', b: 'é' })).toBe('a=x%20y&b=%C3%A9');
  });

  // The reference example of Twitter's "Creating a signature" guide.
  it('signs the published OAuth 1.0a reference request', () => {
    const header = authorizationHeader(
      'https://api.twitter.com/1.1/statuses/update.json',
      { include_entities: 'true', status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
      {
        consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
        consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
        token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      },
      'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
      '1318622958',
    );
    expect(header).toContain(`oauth_signature="${percentEncode('hCtSmYh+iHYCEqBWrE7C7hYmtUk=')}"`);
    expect(header.startsWith('OAuth ')).toBe(true);
    expect(header).toContain('oauth_token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb"');
  });
});
