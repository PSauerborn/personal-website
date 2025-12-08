<template>
  <div class="container">
    <div class="column">
      <p class="text-h3">The Whole Thing</p>
      <project-slider />
    </div>
    <div class="row q-mt-xl">
      <p class="text-body1">
        with a complete set of unit and integrations tests keeping everything in check. Its a
        multi-environment, production-grade platform on a micro-scale. Oh, and its cost-efficient,
        with everything clocking in at just under $10 a month.
      </p>
      <p class="text-body1 q-mt-md">See the whole thing on GH -> url</p>
    </div>
  </div>
</template>

<script setup>
import ProjectSlider from 'src/components/ProjectSlider.vue'
</script>

<style scoped>
.container {
  position: absolute;
  max-width: 600px;
}
</style>
