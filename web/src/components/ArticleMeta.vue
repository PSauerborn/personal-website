<template>
  <div></div>
</template>

<script setup>
import { useMeta } from 'quasar'

const props = defineProps({
  title: { type: String, default: 'Blog Article' },
  description: { type: String, default: '' },
  slug: { type: String, default: '' },
  date: { type: String, default: '' },
  category: { type: String, default: '' },
})

const siteUrl = 'https://pascal-sauerborn.com'

useMeta(() => {
  const articleUrl = `${siteUrl}/blog/${props.slug}`
  const articleDescription =
    props.description ||
    `${props.title} - Read this article on Pascal Sauerborn's blog about software engineering and cloud infrastructure.`

  return {
    title: `${props.title} - Pascal Sauerborn`,

    meta: {
      description: {
        name: 'description',
        content: articleDescription,
      },

      // Open Graph
      ogType: {
        property: 'og:type',
        content: 'article',
      },
      ogUrl: {
        property: 'og:url',
        content: articleUrl,
      },
      ogTitle: {
        property: 'og:title',
        content: props.title,
      },
      ogDescription: {
        property: 'og:description',
        content: articleDescription,
      },
      ogImage: {
        property: 'og:image',
        content: `${siteUrl}/profile.png`,
      },
      articleAuthor: {
        property: 'article:author',
        content: 'Pascal Sauerborn',
      },
      articlePublishedTime: {
        property: 'article:published_time',
        content: props.date,
      },
      articleSection: {
        property: 'article:section',
        content: props.category,
      },

      // Twitter Card
      twitterCard: {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      twitterTitle: {
        name: 'twitter:title',
        content: props.title,
      },
      twitterDescription: {
        name: 'twitter:description',
        content: articleDescription,
      },
    },

    link: {
      canonical: {
        rel: 'canonical',
        href: articleUrl,
      },
    },

    script: {
      ldJson: {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: props.title,
          description: articleDescription,
          author: {
            '@type': 'Person',
            name: 'Pascal Sauerborn',
            url: siteUrl,
          },
          publisher: {
            '@type': 'Person',
            name: 'Pascal Sauerborn',
          },
          datePublished: props.date,
          url: articleUrl,
          image: `${siteUrl}/profile.png`,
        }),
      },
    },
  }
})
</script>
