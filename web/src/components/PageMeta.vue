<template>
  <div></div>
</template>

<script setup>
import { useMeta } from 'quasar'

const siteUrl = 'https://s31-software.com'
const siteName = 'S31 Software & Co LLC'
const title = 'Pascal Sauerborn - Senior Software & DevOps Engineer'
const description =
  'Senior Software Engineer specializing in Backend & Cloud Infrastructure. Python, Go, AWS, Kubernetes, Terraform. Available for Outside IR35 contracts in UK & US. Trading as S31 Software & Co LLC.'

useMeta({
  title,
  titleTemplate: (title) => `${title} | ${siteName}`,

  meta: {
    // Primary Meta Tags
    description: {
      name: 'description',
      content: description,
    },
    keywords: {
      name: 'keywords',
      content:
        'software engineer, backend developer, cloud infrastructure, Python, Golang, Go, AWS, Azure, Kubernetes, Terraform, contractor, UK, US, Outside IR35, S31 Software',
    },
    author: {
      name: 'author',
      content: 'Pascal Sauerborn',
    },
    robots: {
      name: 'robots',
      content: 'index, follow',
    },

    // Open Graph / Facebook
    ogType: {
      property: 'og:type',
      content: 'website',
    },
    ogUrl: {
      property: 'og:url',
      content: siteUrl,
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
    ogSiteName: {
      property: 'og:site_name',
      content: siteName,
    },
    ogLocale: {
      property: 'og:locale',
      content: 'en_GB',
    },

    // Twitter Card
    twitterCard: {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    twitterUrl: {
      name: 'twitter:url',
      content: siteUrl,
    },
    twitterTitle: {
      name: 'twitter:title',
      content: title,
    },
    twitterDescription: {
      name: 'twitter:description',
      content: description,
    },
    twitterImage: {
      name: 'twitter:image',
      content: `${siteUrl}/profile.png`,
    },

    // Additional SEO
    viewport: {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1.0',
    },
    themeColor: {
      name: 'theme-color',
      content: '#c65a1e',
    },
    appleMobileWebAppCapable: {
      name: 'apple-mobile-web-app-capable',
      content: 'yes',
    },
    appleMobileWebAppStatusBarStyle: {
      name: 'apple-mobile-web-app-status-bar-style',
      content: 'default',
    },
  },

  link: {
    canonical: {
      rel: 'canonical',
      href: siteUrl,
    },
  },

  script: {
    // Structured Data / JSON-LD for Person
    ldJson: {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'Pascal Sauerborn',
        jobTitle: 'Senior Software & DevOps Engineer',
        url: siteUrl,
        image: `${siteUrl}/profile.png`,
        sameAs: ['https://github.com/psauerborn', 'https://linkedin.com/in/psauerborn'],
        worksFor: {
          '@type': 'Organization',
          name: 'S31 Software & Co LLC',
        },
        knowsAbout: [
          'Python',
          'Go',
          'AWS',
          'Azure',
          'Kubernetes',
          'Terraform',
          'Backend Development',
          'Cloud Infrastructure',
        ],
      }),
    },
  },
})
</script>
