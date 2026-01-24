<template>
  <q-page class="home-page">
    <PageMeta />
    <HeroSection @scroll="scrollToSection" />
    <template v-if="!loading && !loadingError">
      <AboutSection :skills="resume.skills" />
      <CvSection :experience="resume.experience" :education="resume.education" />
    </template>
    <template v-else-if="loading">
      <div class="loading-section">
        <q-spinner color="primary" size="50px" />
        <p>Loading resume data...</p>
      </div>
    </template>
    <template v-else-if="loadingError">
      <div class="error-section">
        <q-icon name="eva-alert-circle-outline" size="64px" color="negative" />
        <h3>Unable to Load Resume</h3>
        <p>{{ loadingError }}</p>
        <q-btn
          outline
          color="primary"
          label="Try Again"
          icon="eva-refresh-outline"
          @click="loadResume"
        />
      </div>
    </template>
    <ContactSection />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import PageMeta from 'src/components/PageMeta.vue'
import HeroSection from 'src/components/HeroSection.vue'
import AboutSection from 'src/components/AboutSection.vue'
import CvSection from 'src/components/CvSection.vue'
import ContactSection from 'src/components/ContactSection.vue'
import { fetchCV } from 'src/api/core.js'

const resume = ref({
  skills: [],
  experience: [],
  education: [],
})
const loading = ref(false)
const loadingError = ref(null)

const scrollToSection = (sectionId) => {
  const element = document.getElementById(sectionId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const loadResume = async () => {
  loading.value = true
  loadingError.value = null
  try {
    const response = await fetchCV('json')
    resume.value = response.data.data
  } catch (error) {
    console.error('Failed to fetch resume:', error)
    loadingError.value = 'Failed to load resume data. Please try again later.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadResume()

  if (typeof window !== 'undefined' && window.location.hash) {
    const hash = window.location.hash.substring(1)
    setTimeout(() => scrollToSection(hash), 100)
  }
})
</script>

<style lang="scss" scoped>
.home-page {
  padding: 0;
}

.loading-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 24px;
  gap: 16px;

  p {
    color: var(--s31-muted);
    font-size: 1rem;
  }
}

.error-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 24px;
  gap: 16px;
  text-align: center;

  h3 {
    font-family: $font-family-header;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--s31-text);
    margin: 8px 0 0;
  }

  p {
    color: var(--s31-muted);
    font-size: 1rem;
    max-width: 400px;
    margin: 0 0 8px;
  }
}
</style>
