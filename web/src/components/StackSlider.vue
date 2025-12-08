<template>
  <div class="wrapper">
    <Transition name="slide-up">
      <div class="container" v-if="selector === 1">
        <p class="text-h6">Is written using VueJS</p>
        <q-img fit="contain" class="q-ml-md image" src="vue-svgrepo-com.svg"></q-img>
      </div>

      <div class="container" v-else-if="selector === 2">
        <p class="text-h6">Uses a Golang API</p>
        <q-img fit="contain" class="q-ml-md image" src="go-svgrepo-com.svg"></q-img>
      </div>
      <div class="container" v-else-if="selector === 3">
        <p class="text-h6">Hooked up to a PostgreSQL Database</p>
        <q-img fit="contain" class="q-ml-md image" src="postgresql-logo-svgrepo-com.svg"></q-img>
      </div>
      <div class="container" v-else-if="selector === 4">
        <p class="text-h6">All on a Kubernetes Cluster</p>
        <q-img fit="contain" class="q-ml-md image" src="kubernetes-svgrepo-com.svg"></q-img>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const selector = ref(1)

setInterval(() => {
  selector.value = (selector.value % 4) + 1
}, 3000)
</script>

<style scoped>
.wrapper {
  position: relative;
  height: 60px;
}

.image {
  width: 60px;
  height: 60px;
  white-space: nowrap;
}

.container {
  position: absolute;
  display: inline-flex;
  align-items: flex-end;
  gap: 8px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s ease-out;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
