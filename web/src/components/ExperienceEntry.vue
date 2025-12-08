<template>
  <div class="row full-width">
    <div class="row dense justify-between full-width">
      <div class="text-body1 text-weight-bold">{{ company }}</div>
      <div class="text-subtitle2">{{ location }}</div>
    </div>
    <div class="row dense justify-between full-width">
      <div class="text-subtitle2">{{ title }}</div>
      <div class="text-subtitle2">{{ dateRange }}</div>
    </div>
  </div>
  <div class="row q-mt-lg">
    <p class="text-body2">{{ description }}</p>
    <p class="text-body2"><span class="text-weight-bold">Tech Stack:</span> {{ formattedStack }}</p>
    <ul v-if="achievements" class="q-mt-sm">
      <li v-for="(achievement, index) in achievements" :key="index" class="text-body2">
        {{ achievement }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const formattedStack = computed(() => {
  return props.stack.join(', ')
})

const props = defineProps({
  title: String,
  company: String,
  location: String,
  dateRange: String,
  description: String,
  achievements: Array,
  stack: Array,
})
</script>
