import { getCollection } from 'astro:content';

export const prerender = true;

export async function GET() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const sorted = posts.sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  const index = sorted.map(post => ({
    title: post.data.title || '',
    excerpt: post.data.excerpt || '',
    category: post.data.category || '',
    tags: post.data.tags || [],
    image: post.data.image || '',
    slug: `/posts/${post.slug}`,
    date: new Date(post.data.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
