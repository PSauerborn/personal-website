<template>
  <q-page class="article-page">
    <ArticleMeta :title="article.title" />

    <article class="article-container">
      <!-- Article Header -->
      <header class="article-header">
        <router-link to="/blog" class="back-link">
          <q-icon name="eva-arrow-back-outline" size="xs" />
          Back to Blog
        </router-link>

        <span class="article-category">{{ article.category }}</span>
        <h1 class="article-title">{{ article.title }}</h1>

        <div class="article-meta">
          <div class="author">
            <q-avatar size="40px">
              <img src="/profile.png" alt="Pascal Sauerborn" />
            </q-avatar>
            <div>
              <span class="author-name">Pascal Sauerborn</span>
              <span class="author-role">Senior Software Engineer</span>
            </div>
          </div>
          <div class="meta-details">
            <span>{{ article.date }}</span>
            <span class="separator">·</span>
            <span>{{ article.readTime }}</span>
          </div>
        </div>
      </header>

      <!-- Article Content -->
      <div class="article-content">
        <p class="lead">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
          ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
          ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>

        <h2>Introduction</h2>
        <p>
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat
          nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia
          deserunt mollit anim id est laborum.
        </p>
        <p>
          Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
          laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
          architecto beatae vitae dicta sunt explicabo.
        </p>

        <h2>Key Concepts</h2>
        <p>
          Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
          consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
        </p>
        <ul>
          <li>Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet</li>
          <li>Consectetur, adipisci velit, sed quia non numquam eius modi tempora</li>
          <li>Incidunt ut labore et dolore magnam aliquam quaerat voluptatem</li>
          <li>Ut enim ad minima veniam, quis nostrum exercitationem ullam</li>
        </ul>

        <h2>Implementation Details</h2>
        <p>
          At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
          voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati
          cupiditate non provident.
        </p>

        <div class="code-block">
          <pre><code>// Example code snippet
func main() {
    server := NewServer(Config{
        Port: 8080,
        Timeout: 30 * time.Second,
    })

    log.Fatal(server.Run())
}</code></pre>
        </div>

        <p>
          Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum
          fuga. Et harum quidem rerum facilis est et expedita distinctio.
        </p>

        <h2>Conclusion</h2>
        <p>
          Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id
          quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor
          repellendus.
        </p>
      </div>

      <!-- Article Footer -->
      <footer class="article-footer">
        <div class="article-tags">
          <span v-for="tag in article.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>

        <div class="share-section">
          <span>Share this article:</span>
          <div class="share-buttons">
            <q-btn flat round icon="eva-twitter-outline" size="sm" />
            <q-btn flat round icon="eva-linkedin-outline" size="sm" />
            <q-btn flat round icon="eva-link-2-outline" size="sm" @click="copyLink" />
          </div>
        </div>
      </footer>
    </article>
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import ArticleMeta from 'src/components/ArticleMeta.vue'

const route = useRoute()
const $q = useQuasar()

const articles = {
  'building-scalable-apis-with-go': {
    title: 'Building Scalable APIs with Go',
    date: 'January 2026',
    readTime: '8 min read',
    category: 'Backend',
    tags: ['Go', 'REST API', 'Architecture'],
  },
  'terraform-best-practices-aws': {
    title: 'Terraform Best Practices for AWS Infrastructure',
    date: 'December 2025',
    readTime: '12 min read',
    category: 'Infrastructure',
    tags: ['Terraform', 'AWS', 'IaC'],
  },
  'dynamodb-single-table-design': {
    title: 'Mastering DynamoDB Single-Table Design',
    date: 'November 2025',
    readTime: '15 min read',
    category: 'Database',
    tags: ['DynamoDB', 'NoSQL', 'AWS'],
  },
}

const article = computed(() => {
  const slug = route.params.slug
  return articles[slug] || articles['building-scalable-apis-with-go']
})

const copyLink = () => {
  if (typeof navigator !== 'undefined') {
    navigator.clipboard.writeText(window.location.href)
    $q.notify({
      type: 'positive',
      message: 'Link copied to clipboard!',
      position: 'top',
      timeout: 2000,
    })
  }
}
</script>

<style lang="scss" scoped>
.article-page {
  padding: 0;
  background: var(--s31-surface);
}

.article-container {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.article-header {
  margin-bottom: 48px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--s31-muted);
  text-decoration: none;
  font-size: 0.9rem;
  margin-bottom: 24px;
  transition: color 0.2s ease;

  &:hover {
    color: $primary;
  }
}

.article-category {
  display: inline-block;
  background: rgba(198, 90, 30, 0.1);
  color: $primary;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 16px;
}

.article-title {
  font-family: $font-family-header;
  font-size: clamp(2rem, 5vw, 2.75rem);
  font-weight: 700;
  color: var(--s31-text);
  line-height: 1.2;
  margin: 0 0 24px;
}

.article-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.author-name {
  display: block;
  font-weight: 600;
  color: var(--s31-text);
}

.author-role {
  font-size: 0.85rem;
  color: var(--s31-muted);
}

.meta-details {
  display: flex;
  gap: 8px;
  color: var(--s31-muted);
  font-size: 0.9rem;
}

.separator {
  opacity: 0.5;
}

.article-content {
  font-size: 1.1rem;
  line-height: 1.8;
  color: var(--s31-text);

  .lead {
    font-size: 1.25rem;
    color: var(--s31-muted);
    margin-bottom: 32px;
  }

  h2 {
    font-family: $font-family-header;
    font-size: 1.5rem;
    font-weight: 700;
    margin: 40px 0 16px;
    color: var(--s31-text);
  }

  p {
    margin: 0 0 20px;
  }

  ul {
    margin: 0 0 24px;
    padding-left: 24px;

    li {
      margin-bottom: 8px;
      color: var(--s31-muted);
    }
  }
}

.code-block {
  background: $dark;
  border-radius: 12px;
  padding: 24px;
  margin: 24px 0;
  overflow-x: auto;

  pre {
    margin: 0;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  code {
    color: #e6e6e6;
  }
}

.article-footer {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 1px solid var(--s31-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px;
}

.article-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  background: rgba(198, 90, 30, 0.08);
  color: $primary;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
}

.share-section {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--s31-muted);
  font-size: 0.9rem;
}

.share-buttons {
  display: flex;
  gap: 4px;

  .q-btn {
    color: var(--s31-muted);
  }
  .q-btn:hover {
    color: $primary;
  }
}
</style>
