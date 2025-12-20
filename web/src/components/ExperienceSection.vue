<template>
  <div class="container q-pa-md">
    <div class="row">
      <div class="col">
        <p class="text-h5"><span class="highlight">Exp</span>erience</p>
        <q-separator class="q-mb-md" />
      </div>
    </div>
    <div class="column fill-height flex flex-center" v-if="!initiated">
      <q-spinner color="primary" size="50px" />
      <p class="text-body1 q-mt-md">Loading CV...</p>
    </div>
    <div v-else>
      <div class="row entry-container" v-for="(entry, i) in cv.experience" :key="i">
        <div class="col-lg-4 col-md-4 col-sm-12 col-xs-12">
          {{ entry.dateRange }}
        </div>
        <div class="col-lg-8 col-md-8 col-sm-12 col-xs-12">
          <p class="text-body2 text-weight-bold">{{ entry.title }} - {{ entry.company }}</p>
          <p class="text-body2">{{ entry.description }}</p>
          <div class="row">
            <q-chip size="sm" v-for="(stack, i) in entry.stack" :key="i" class="q-mr-sm">
              {{ stack }}
            </q-chip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { fetchCV } from 'src/api/core.js'
import { ref, onMounted } from 'vue'

const initiated = ref(false)
const cv = ref(null)

onMounted(async () => {
  fetchCV('json')
    .then((response) => {
      cv.value = response.data.data
      initiated.value = true
      console.log(cv.value)
    })
    .catch((error) => {
      console.error('Error fetching CV:', error)
    })
})
</script>

<style scoped>
.highlight {
  color: var(--q-primary);
}

.container {
  max-width: 600px;
}

.entry-container {
  margin-bottom: 30px;
}
</style>
