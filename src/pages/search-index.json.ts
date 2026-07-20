import { getCollection } from 'astro:content';

export const prerender = true;

export async function GET() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const index = posts.map(post => ({
    title: post.data.title,
    excerpt: post.data.excerpt,
    category: post.data.category,
    tags: post.data.tags,
    image: post.data.image,
    slug: `/posts/${post.slug}`,
    date: post.data.date,
  }));

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' }
  });
}
