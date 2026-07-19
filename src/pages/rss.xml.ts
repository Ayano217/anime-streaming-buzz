import { getCollection } from 'astro:content';

export const prerender = true;

function escapeXml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET({ site }: { site: URL }) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const sortedPosts = posts
    .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime())
    .slice(0, 30);

  const siteUrl = site?.toString().replace(/\/$/, '') || 'https://anime-streaming-buzz.pages.dev';

  const items = sortedPosts.map((post) => {
    const url = `${siteUrl}/posts/${post.slug}`;
    return `
      <item>
        <title>${escapeXml(post.data.title)}</title>
        <link>${url}</link>
        <guid>${url}</guid>
        <pubDate>${new Date(post.data.date).toUTCString()}</pubDate>
        <description>${escapeXml(post.data.excerpt)}</description>
      </item>
    `;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
      <title>AniTube Buzz</title>
      <link>${siteUrl}</link>
      <description>Anime Recaps, Streaming News, Manhwa Updates</description>
      <language>en-us</language>
      ${items}
    </channel>
  </rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8'
    }
  });
}
