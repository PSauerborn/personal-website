<template>
  <div></div>
</template>

<script setup>
import { useMeta } from 'quasar'

const siteUrl = 'https://pascal-sauerborn.com'
const pageUrl = `${siteUrl}/blog`
const title = 'Blog - Thoughts & Insights'
const description =
  'Thoughts and insights on software engineering, cloud architecture, backend development, and building production systems. By Pascal Sauerborn.'

useMeta({
  title,

  meta: {
    description: {
      name: 'description',
      content: description,
    },

    // Open Graph
    ogType: {
      property: 'og:type',
      content: 'website',
    },
    ogUrl: {
      property: 'og:url',
      content: pageUrl,
    },
    ogTitle: {
      property: 'og:title',
      content: title,
    },
    ogDescription: {
      property: 'og:description',
      content: description,
    },
    ogImage: {
      property: 'og:image',
      content: `${siteUrl}/profile.png`,
    },

    // Twitter Card
    twitterCard: {
      name: 'twitter:card',
      content: 'summary',
    },
    twitterTitle: {
      name: 'twitter:title',
      content: title,
    },
    twitterDescription: {
      name: 'twitter:description',
      content: description,
    },
  },

  link: {
    canonical: {
      rel: 'canonical',
      href: pageUrl,
    },
  },
})
</script>
