<template>
  <q-layout view="hHh Lpr lFf">
    <!-- Header -->
    <q-header class="app-header q-pa-sm" bordered>
      <q-toolbar class="toolbar-content">
        <router-link to="/" class="logo-link">
          <div class="logo-container">
            <q-avatar size="42px" class="logo-avatar">
              <img src="/profile.png" alt="Pascal Sauerborn" />
            </q-avatar>
            <span class="logo-text">Pascal Sauerborn</span>
          </div>
        </router-link>

        <q-space />

        <!-- Desktop Navigation -->
        <nav class="desktop-nav gt-sm">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="nav-link"
            :class="{
              active:
                $route.path === link.to || (link.to !== '/' && $route.path.startsWith(link.to)),
            }"
          >
            {{ link.label }}
          </router-link>
        </nav>

        <q-separator class="q-mx-md" vertical inset />

        <!-- Header Actions -->
        <div class="header-actions gt-sm">
          <q-btn
            color="primary"
            label="Download CV"
            class="header-btn"
            size="sm"
            @click="downloadPdf"
          />
          <q-btn
            outline
            unelevated
            color="primary"
            label="Get in Touch"
            class="header-btn primary-btn"
            size="sm"
            @click="scrollToContact"
          />
        </div>

        <q-btn
          flat
          round
          icon="menu"
          class="lt-md mobile-menu-btn"
          @click="drawer = !drawer"
          aria-label="Menu"
        />
      </q-toolbar>
    </q-header>

    <!-- Mobile Drawer -->
    <q-drawer v-model="drawer" side="right" overlay behavior="mobile" class="mobile-drawer">
      <q-list class="drawer-list">
        <q-item-label header class="drawer-header">Navigation</q-item-label>
        <q-item
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          clickable
          v-ripple
          class="drawer-item"
          :class="{ active: $route.path === link.to }"
          @click="drawer = false"
        >
          <q-item-section avatar>
            <q-icon :name="link.icon" />
          </q-item-section>
          <q-item-section>{{ link.label }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <!-- Main Content -->
    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Footer -->
    <footer class="app-footer">
      <div class="footer-content">
        <div class="footer-main">
          <div class="footer-brand">
            <q-avatar size="36px" class="footer-avatar">
              <img src="/profile.png" alt="Pascal Sauerborn" />
            </q-avatar>
            <span class="footer-name">Pascal Sauerborn</span>
          </div>
          <p class="footer-tagline">Senior Software Engineer · Backend & Cloud Infrastructure</p>
        </div>

        <div class="footer-links">
          <a
            href="https://github.com/psauerborn"
            target="_blank"
            rel="noopener"
            class="footer-social"
          >
            <q-icon name="eva-github-outline" />
          </a>
          <a
            href="https://www.linkedin.com/in/pascal-sauerborn-130452175/"
            target="_blank"
            rel="noopener"
            class="footer-social"
          >
            <q-icon name="eva-linkedin-outline" />
          </a>
          <a href="mailto:pascal.sauerborn@gmail.com" class="footer-social">
            <q-icon name="eva-email-outline" />
          </a>
        </div>

        <div class="footer-bottom">
          <p>&copy; {{ new Date().getFullYear() }} Pascal Sauerborn. All rights reserved.</p>
          <p class="footer-location">
            <q-icon name="eva-pin-outline" size="xs" />
            Available for Outside IR35 contracts · UK & US
          </p>
          <p class="footer-trading">Trading as S31 Software & Co LLC</p>
        </div>
      </div>
    </footer>
  </q-layout>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { fetchCV } from 'src/api/core.js'

const router = useRouter()
const $q = useQuasar()
const drawer = ref(false)

const navLinks = [
  { label: 'Home', to: '/', icon: 'eva-home-outline' },
  // { label: 'Blog', to: '/blog', icon: 'eva-file-text-outline' }
]

const downloadPdf = async () => {
  try {
    $q.notify({
      type: 'info',
      message: 'Downloading resume...',
      position: 'top',
      timeout: 2000,
    })

    const response = await fetchCV('pdf')
    const base64Data = response.data.data

    // Decode base64 and create blob
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/pdf' })

    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'Pascal_Sauerborn_CV.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    $q.notify({
      type: 'positive',
      message: 'Resume downloaded successfully!',
      position: 'top',
      timeout: 3000,
    })
  } catch (error) {
    console.error('Failed to download resume:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to download resume. Please try again.',
      position: 'top',
      timeout: 4000,
    })
  }
}

const scrollToContact = () => {
  // If not on home page, navigate there first
  if (router.currentRoute.value.path !== '/') {
    router.push('/#contact')
  } else {
    const element = document.getElementById('contact')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}
</script>

<style lang="scss" scoped>
.app-header {
  background: var(--s31-surface);
  border-bottom: 1px solid var(--s31-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.toolbar-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  width: 100%;
}

.logo-link {
  text-decoration: none;
  color: inherit;
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-avatar {
  border: 2px solid var(--s31-border);
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }
}

.logo-text {
  font-family: $font-family-header;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--s31-text);
}

.desktop-nav {
  display: flex;
  gap: 8px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--s31-muted);
  font-weight: 500;
  font-size: 0.95rem;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(198, 90, 30, 0.08);
    color: $primary;
  }

  &.active {
    background: rgba(198, 90, 30, 0.12);
    color: $primary;
  }
}

.header-actions {
  display: flex;
  gap: 12px;
  margin-left: 8px;
}

.header-btn {
  text-transform: none;
  font-weight: 600;
  border-radius: 8px;
  padding: 8px 16px;
}

.header-btn.primary-btn {
  box-shadow: 0 2px 8px rgba(198, 90, 30, 0.25);

  &:hover {
    box-shadow: 0 4px 12px rgba(198, 90, 30, 0.35);
  }
}

.mobile-menu-btn {
  color: var(--s31-text);
}

.mobile-drawer {
  background: var(--s31-surface);
}

.drawer-list {
  padding-top: 16px;
}

.drawer-header {
  font-family: $font-family-header;
  font-weight: 600;
  color: var(--s31-text);
}

.drawer-item {
  margin: 4px 12px;
  border-radius: 8px;

  &.active {
    background: rgba(198, 90, 30, 0.12);
    color: $primary;
  }
}

.app-footer {
  background: var(--s31-surface);
  border-top: 1px solid var(--s31-border);
  padding: 48px 24px 32px;
  margin-top: auto;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.footer-main {
  margin-bottom: 24px;
}

.footer-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}

.footer-avatar {
  border: 2px solid var(--s31-border);
}

.footer-name {
  font-family: $font-family-header;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--s31-text);
}

.footer-tagline {
  color: var(--s31-muted);
  font-size: 0.9rem;
  margin: 0;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.footer-social {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(198, 90, 30, 0.08);
  color: $primary;
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    background: $primary;
    color: white;
    transform: translateY(-2px);
  }

  .q-icon {
    font-size: 1.2rem;
  }
}

.footer-bottom {
  padding-top: 24px;
  border-top: 1px solid var(--s31-border);

  p {
    margin: 0 0 8px;
    color: var(--s31-muted);
    font-size: 0.85rem;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

.footer-location {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: $primary !important;
  font-weight: 500;
}

.footer-trading {
  font-size: 0.8rem !important;
  opacity: 0.7;
  margin-top: 4px !important;
}
</style>
