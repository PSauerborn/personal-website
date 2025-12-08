<template>
  <div class="row full-width">
    <div class="row dense justify-between full-width">
      <div class="text-body1 text-weight-bold">{{ institution }}</div>
      <div class="text-subtitle2">{{ location }}</div>
    </div>
    <div class="row dense justify-between full-width">
      <div class="text-subtitle2">{{ degree }}</div>
      <div class="text-subtitle2">{{ dateRange }}</div>
    </div>
  </div>
  <div class="row q-mt-lg">
    <p class="text-body2">{{ description }}</p>
  </div>
</template>

<script setup>
defineProps({
  degree: String,
  institution: String,
  location: String,
  dateRange: String,
  description: String,
})
</script>
