import type { MetadataRoute } from 'next';

/**
 * The app had no robots directives at all, which was harmless while every
 * page sat behind a login. Publishing a job board makes it worth being
 * explicit — particularly about /share/*, which is meant for one named
 * recipient and must never turn up in a search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/jobs', '/jobs/'],
        disallow: ['/', '/share/', '/api/', '/login'],
      },
    ],
  };
}
