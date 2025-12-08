<template>
  <div class="container">
    <div class="row">
      <p class="text-body1">
        If you're reading this, you're likely looking for a backend developer. I could give you a
        list of qualifications and past experience giving you a vague idea of what I can deliver.
        Or...
      </p>
      <p class="text-body1">I could just show you.</p>
    </div>
    <div class="column q-mt-xl">
      <p class="text-h3">This Website</p>
      <stack-slider />
    </div>
  </div>
</template>

<script setup>
import StackSlider from 'src/components/StackSlider.vue'
</script>

<style scoped>
.container {
  position: absolute;
  max-width: 600px;
}
</style>
