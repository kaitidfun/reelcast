# Google Search setup

The public product page is `/about`. It is rendered on the server so its text,
heading, metadata and structured data can be read without signing in.
The dashboard and authentication routes return `noindex, nofollow` metadata.
Robots directives are search preferences; existing authentication still controls access.

## When deploying

1. Set `NEXT_PUBLIC_SITE_URL` in the frontend build environment to its public origin,
   such as `https://your-domain.com`. Use the frontend domain, not the backend/API
   address. Build and redeploy after changing it.
2. Optionally set `GOOGLE_SITE_VERIFICATION` to the verification token from Google
   Search Console's HTML tag method before building.
3. Check `/about`, `/robots.txt`, `/sitemap.xml` and `/opengraph-image` on the public
   deployment. Confirm canonical and sitemap URLs use the real frontend domain.
4. Verify ownership in Google Search Console, submit `/sitemap.xml`, and inspect
   the `/about` URL to request indexing.

Production indexing is enabled only when a site URL is configured. Local development
uses `noindex` and `Disallow: /`; the sitemap is empty without deployment configuration.
Private pages are excluded from the sitemap. On a configured production site they
remain crawlable so Google can read their `noindex` metadata.

The app's root `/` remains the existing member dashboard. Search results should point
to `/about`. Search indexing and ranking are decided by Google and are not immediate.
