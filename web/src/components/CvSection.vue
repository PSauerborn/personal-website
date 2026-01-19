<template>
  <section id="cv" class="cv-section">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">CV</span>
        <h2 class="section-title">Professional Experience</h2>
        <p class="section-description">
          A track record of delivering impactful backend systems across healthcare, ML/AI, and
          energy sectors.
        </p>
      </div>

      <div class="cv-actions">
        <q-btn
          unelevated
          color="primary"
          label="Download PDF Resume"
          icon="eva-download-outline"
          class="download-btn"
          @click="downloadPdf"
        />
      </div>

      <!-- Timeline -->
      <div class="timeline">
        <div v-for="(exp, index) in experience" :key="exp.company" class="timeline-item">
          <div class="timeline-marker">
            <div class="marker-dot"></div>
            <div class="marker-line" v-if="index < experience.length - 1"></div>
          </div>

          <div class="timeline-content">
            <div class="timeline-meta">
              <span class="timeline-date">{{ exp.dateRange }}</span>
              <span class="timeline-location">
                <q-icon name="eva-pin-outline" size="xs" />
                {{ exp.location }}
              </span>
            </div>
            <h3 class="timeline-title">{{ exp.title }}</h3>
            <p class="timeline-company">{{ exp.company }}</p>
            <p class="timeline-description">{{ exp.description }}</p>

            <div class="timeline-achievements">
              <h4>Key Achievements</h4>
              <ul>
                <li v-for="achievement in exp.achievements" :key="achievement">
                  {{ achievement }}
                </li>
              </ul>
            </div>

            <div class="timeline-stack">
              <span v-for="tech in exp.stack" :key="tech" class="tech-tag">
                {{ tech }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Education -->
      <div class="education-section">
        <h3 class="subsection-title">
          <q-icon name="eva-book-outline" />
          Education
        </h3>
        <div v-for="edu in education" :key="edu.institution" class="education-item">
          <div class="education-header">
            <h4>{{ edu.degree }}</h4>
            <span class="education-date">{{ edu.dateRange }}</span>
          </div>
          <p class="education-institution">{{ edu.institution }} · {{ edu.location }}</p>
          <p class="education-description">{{ edu.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useQuasar } from 'quasar'
import { fetchCV } from 'src/api/core.js'

defineProps({
  experience: { type: Array, required: true },
  education: { type: Array, required: true },
})

const $q = useQuasar()

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
</script>

<style lang="scss" scoped>
.cv-section {
  padding: 100px 24px;
  background: var(--s31-paper);
}

.section-container {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  text-align: center;
  margin-bottom: 48px;
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

.section-title {
  font-family: $font-family-header;
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 700;
  color: var(--s31-text);
  margin: 0 0 16px;
}

.section-description {
  font-size: 1.1rem;
  color: var(--s31-muted);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

.cv-actions {
  text-align: center;
  margin-bottom: 48px;
}

.download-btn {
  padding: 14px 32px;
  font-weight: 600;
  border-radius: 12px;
  text-transform: none;
  font-size: 1rem;
  box-shadow: 0 4px 14px rgba(198, 90, 30, 0.25);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(198, 90, 30, 0.35);
  }

  @media (max-width: 600px) {
    width: 100%;
  }
}

.timeline {
  max-width: 800px;
  margin: 0 auto;
}

.timeline-item {
  display: flex;
  gap: 32px;
  position: relative;

  @media (max-width: 600px) {
    gap: 0;
  }
}

.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;

  @media (max-width: 600px) {
    display: none;
  }
}

.marker-dot {
  width: 16px;
  height: 16px;
  background: $primary;
  border: 3px solid var(--s31-paper);
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(198, 90, 30, 0.2);
}

.marker-line {
  width: 2px;
  flex: 1;
  background: var(--s31-border);
  margin: 8px 0;
}

.timeline-content {
  flex: 1;
  background: var(--s31-surface);
  border: 1px solid var(--s31-border);
  border-radius: 16px;
  padding: 28px;
  margin-bottom: 32px;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }
}

.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}

.timeline-date {
  color: $primary;
  font-weight: 600;
  font-size: 0.9rem;
}

.timeline-location {
  color: var(--s31-muted);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

.timeline-title {
  font-family: $font-family-header;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--s31-text);
  margin: 0 0 4px;
}

.timeline-company {
  font-size: 1rem;
  color: var(--s31-muted);
  margin: 0 0 16px;
  font-weight: 500;
}

.timeline-description {
  font-size: 1rem;
  color: var(--s31-text);
  line-height: 1.7;
  margin: 0 0 20px;
}

.timeline-achievements {
  margin-bottom: 20px;

  h4 {
    font-family: $font-family-header;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--s31-text);
    margin: 0 0 12px;
  }

  ul {
    margin: 0;
    padding-left: 20px;

    li {
      color: var(--s31-muted);
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 8px;
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}

.timeline-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tech-tag {
  background: rgba(198, 90, 30, 0.08);
  color: $primary;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.education-section {
  max-width: 800px;
  margin: 48px auto 0;
  padding-top: 48px;
  border-top: 1px solid var(--s31-border);
}

.subsection-title {
  font-family: $font-family-header;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--s31-text);
  margin: 0 0 24px;
  display: flex;
  align-items: center;
  gap: 12px;

  .q-icon {
    color: $primary;
  }
}

.education-item {
  background: var(--s31-surface);
  border: 1px solid var(--s31-border);
  border-radius: 16px;
  padding: 24px;
}

.education-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;

  h4 {
    font-family: $font-family-header;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--s31-text);
    margin: 0;
  }
}

.education-date {
  color: $primary;
  font-weight: 600;
  font-size: 0.9rem;
}
.education-institution {
  color: var(--s31-muted);
  font-size: 0.95rem;
  margin: 0 0 8px;
}
.education-description {
  color: var(--s31-text);
  font-size: 0.95rem;
  margin: 0;
}
</style>
