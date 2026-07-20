import { getCollection } from 'astro:content';

export const prerender = true;

export async function GET({ site }: { site: URL }) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const siteUrl = site?.toString().replace(/\/$/, '') || 'https://anime-streaming-buzz.pages.dev';

  const staticPages = [
    '',
    '/about',
    '/rss.xml',
  ];

  const postPages = posts.map(post => `/posts/${post.slug}`);

  const categoryPages = [...new Set(posts.map(post =>
    `/category/${post.data.category.toLowerCase().replace(/\s+/g, '-')}`
  ))];

  const toSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const tagPages = [...new Set(posts.flatMap(post =>
  post.data.tags.map(tag => `/tags/${toSlug(tag)}`)
))];
  const allUrls = [...staticPages, ...postPages, ...categoryPages, ...tagPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${allUrls.map((path) => `
      <url>
        <loc>${siteUrl}${path}</loc>
      </url>
    `).join('')}
  </urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}
