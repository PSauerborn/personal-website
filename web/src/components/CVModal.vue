<template>
  <q-card class="card" v-if="!initiated">
    <q-card-section>
      <div class="column flex-center">
        <q-spinner color="primary" size="50px" />
        <p class="text-body1 q-mt-md">Loading CV...</p>
      </div>
    </q-card-section>
  </q-card>
  <q-card class="card" v-else>
    <q-card-section>
      <p class="text-h6"><span class="highlight">Tech</span><span>nical Skills</span></p>
      <div v-for="(skill, i) in cv.skills" :key="i">
        <p class="text-body2">
          <span class="title">{{ skill.name }}:</span> {{ skill.items.join(', ') }}
        </p>
      </div>
    </q-card-section>
    <q-separator></q-separator>
    <q-card-section>
      <p class="text-h6">
        <span class="highlight">Exp</span><span class="anti-highlight">erience</span>
      </p>
      <div class="row q-mb-lg full-width" v-for="(entry, i) in cv.experience" :key="i">
        <ExperienceEntry
          :title="entry.title"
          :company="entry.company"
          :dateRange="entry.dateRange"
          :location="entry.location"
          :description="entry.description"
          :achievements="entry.achievements"
          :stack="entry.stack"
        />
      </div>
    </q-card-section>
    <q-separator></q-separator>
    <q-card-section>
      <p class="text-h6">
        <span class="highlight">Edu</span><span class="anti-highlight">cation</span>
      </p>
      <div class="row q-mb-lg full-width" v-for="(edu, i) in cv.education" :key="i">
        <EducationEntry
          :degree="edu.degree"
          :institution="edu.institution"
          :dateRange="edu.dateRange"
          :location="edu.location"
          :description="edu.description"
        />
      </div>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn flat color="primary" label="Download PDF" @click="downloadCV" />
    </q-card-actions>
  </q-card>
</template>

<script setup>
import ExperienceEntry from './ExperienceEntry.vue'
import EducationEntry from './EducationEntry.vue'
import { fetchCV } from 'src/api/core.js'
import { ref, onMounted } from 'vue'

const initiated = ref(false)
const cv = ref(null)

const downloadCV = async () => {
  fetchCV('pdf')
    .then((response) => {
      const encodedData = response.data.data
      // decode base64 string
      const byteCharacters = atob(encodedData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/pdf' })

      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(blob)
      link.download = 'PSauerborn - CV.pdf'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
    .catch((error) => {
      console.error('Error downloading CV:', error)
    })
}

onMounted(async () => {
  fetchCV('json')
    .then((response) => {
      cv.value = response.data.data
      initiated.value = true
    })
    .catch((error) => {
      console.error('Error fetching CV:', error)
    })
})
</script>

<style scoped>
.card {
  width: 100%;
}

.title {
  font-weight: bold;
}

.highlight {
  color: var(--q-primary);
}
</style>
