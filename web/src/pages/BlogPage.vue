<template>
  <q-page class="blog-page">
    <BlogMeta />

    <!-- Blog Header -->
    <section class="blog-header">
      <div class="header-content">
        <span class="section-label">Blog</span>
        <h1 class="page-title">Thoughts & Insights</h1>
        <p class="page-description">
          Writing about software engineering, cloud architecture, and lessons learned building
          production systems.
        </p>
      </div>
    </section>

    <!-- Blog Grid -->
    <section class="blog-grid-section">
      <div class="blog-container">
        <div class="blog-grid">
          <article
            v-for="post in blogPosts"
            :key="post.slug"
            class="blog-card"
            @click="viewPost(post.slug)"
          >
            <div class="card-image">
              <div class="image-placeholder">
                <q-icon :name="post.icon" size="xl" />
              </div>
              <span class="card-category">{{ post.category }}</span>
            </div>
            <div class="card-content">
              <div class="card-meta">
                <span class="card-date">{{ post.date }}</span>
                <span class="card-read-time">{{ post.readTime }}</span>
              </div>
              <h2 class="card-title">{{ post.title }}</h2>
              <p class="card-excerpt">{{ post.excerpt }}</p>
              <div class="card-tags">
                <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </div>
          </article>
        </div>

        <!-- Coming Soon Notice -->
        <div class="coming-soon">
          <q-icon name="eva-edit-outline" size="lg" />
          <h3>More articles coming soon</h3>
          <p>
            I'm working on new content about cloud architecture, backend best practices, and lessons
            from building production systems.
          </p>
        </div>
      </div>
    </section>
  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router'
import BlogMeta from 'src/components/BlogMeta.vue'

const router = useRouter()

const blogPosts = [
  {
    slug: 'building-scalable-apis-with-go',
    title: 'Building Scalable APIs with Go',
    excerpt:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    date: 'January 2026',
    readTime: '8 min read',
    category: 'Backend',
    icon: 'eva-code-outline',
    tags: ['Go', 'REST API', 'Architecture'],
  },
  {
    slug: 'terraform-best-practices-aws',
    title: 'Terraform Best Practices for AWS Infrastructure',
    excerpt:
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
    date: 'December 2025',
    readTime: '12 min read',
    category: 'Infrastructure',
    icon: 'eva-cloud-upload-outline',
    tags: ['Terraform', 'AWS', 'IaC'],
  },
  {
    slug: 'dynamodb-single-table-design',
    title: 'Mastering DynamoDB Single-Table Design',
    excerpt:
      'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem.',
    date: 'November 2025',
    readTime: '15 min read',
    category: 'Database',
    icon: 'eva-hard-drive-outline',
    tags: ['DynamoDB', 'NoSQL', 'AWS'],
  },
]

const viewPost = (slug) => {
  router.push(`/blog/${slug}`)
}
</script>

<style lang="scss" scoped>
.blog-page {
  padding: 0;
}

.blog-header {
  padding: 80px 24px 60px;
  background: linear-gradient(135deg, var(--s31-paper) 0%, var(--s31-surface) 100%);
  text-align: center;
}

.header-content {
  max-width: 700px;
  margin: 0 auto;
}

.section-label {
  display: inline-block;
  color: $primary;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.page-title {
  font-family: $font-family-header;
  font-size: clamp(2.5rem, 5vw, 3.5rem);
  font-weight: 700;
  color: var(--s31-text);
  margin: 0 0 16px;
}

.page-description {
  font-size: 1.15rem;
  color: var(--s31-muted);
  line-height: 1.7;
  margin: 0;
}

.blog-grid-section {
  padding: 60px 24px 100px;
  background: var(--s31-surface);
}

.blog-container {
  max-width: 1200px;
  margin: 0 auto;
}

.blog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 32px;
  margin-bottom: 64px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.blog-card {
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.1);

    .card-title {
      color: $primary;
    }
  }
}

.card-image {
  position: relative;
  height: 180px;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(198, 90, 30, 0.08) 0%, rgba(224, 122, 47, 0.08) 100%);
  display: flex;
  align-items: center;
  justify-content: center;

  .q-icon {
    color: $primary;
    opacity: 0.6;
  }
}

.card-category {
  position: absolute;
  top: 16px;
  left: 16px;
  background: var(--s31-surface);
  color: $primary;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
}

.card-content {
  padding: 24px;
}

.card-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 0.85rem;
  color: var(--s31-muted);
}

.card-title {
  font-family: $font-family-header;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--s31-text);
  margin: 0 0 12px;
  transition: color 0.2s ease;
  line-height: 1.3;
}

.card-excerpt {
  color: var(--s31-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0 0 16px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  background: rgba(198, 90, 30, 0.08);
  color: $primary;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.coming-soon {
  text-align: center;
  padding: 48px 24px;
  background: var(--s31-paper);
  border: 1px dashed var(--s31-border);
  border-radius: 16px;

  .q-icon {
    color: $primary;
    opacity: 0.6;
    margin-bottom: 16px;
  }

  h3 {
    font-family: $font-family-header;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--s31-text);
    margin: 0 0 8px;
  }

  p {
    color: var(--s31-muted);
    font-size: 0.95rem;
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.6;
  }
}
</style>
