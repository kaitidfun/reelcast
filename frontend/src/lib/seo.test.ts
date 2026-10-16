import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function setup(mode: string, url: string) {
  vi.stubEnv('NODE_ENV', mode);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', url);
  vi.resetModules();
  return Promise.all([import('@/app/robots'), import('@/app/sitemap'), import('./seo')]);
}

it('keeps local and unconfigured sites out of search results', async () => {
  for (const [mode, url] of [['development', 'https://reelcast.example'], ['production', '']]) {
    const [robots, sitemap, seo] = await setup(mode, url);
    expect(seo.canIndex).toBe(false);
    expect(robots.default()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(sitemap.default()).toEqual([]);
  }
});

it('indexes only public content using the configured production domain', async () => {
  const [robots, sitemap, seo] = await setup('production', 'https://reelcast.example');
  expect(seo.canIndex).toBe(true);
  expect(robots.default()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: 'https://reelcast.example/sitemap.xml' });
  expect(sitemap.default()).toEqual([{ url: 'https://reelcast.example/about' }]);
  expect(seo.privateMetadata.robots).toEqual({ index: false, follow: false });
});

it('rejects an API path or credentials as the public site origin', async () => {
  for (const url of ['https://reelcast.example/api', 'https://user:pass@reelcast.example', 'javascript:alert(1)']) {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', url);
    vi.resetModules();
    await expect(import('./seo')).rejects.toThrow();
  }
});
