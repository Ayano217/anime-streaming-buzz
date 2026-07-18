import { defineCollection, z } from 'astro:content';

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    author: z.string().default('AniTube Buzz'),
    date: z.string(),
    updated: z.string().optional(),
    image: z.string(),
    imageAlt: z.string().default(''),
    featured: z.boolean().default(false),
    trending: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  posts: postsCollection,
};
