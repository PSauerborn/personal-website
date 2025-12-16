<template>
  <div>
    <q-dialog v-model="cvDialog">
      <cv-modal></cv-modal>
    </q-dialog>

    <q-dialog v-model="contactDialog">
      <contact-modal></contact-modal>
    </q-dialog>
    <div class="row justify-between items-center header">
      <div class="col-2-sm col-2-xs col-6-md col-6-lg">
        <p class="text-h4 header-title"><span class="highlight">Pas</span>cal Sauerborn</p>
      </div>
      <div class="col justify-end flex gt-sm">
        <q-btn flat no-caps label="About Me" @click="goTo('about-me')"></q-btn>
        <q-btn flat no-caps label="Portfolio" @click="goTo('portfolio')"></q-btn>
        <q-btn
          outline
          color="primary"
          class="q-mx-sm gt-sm"
          no-caps
          label="View CV"
          @click="cvDialog = true"
        ></q-btn>
        <q-btn
          class="gt-sm"
          color="secondary"
          no-caps
          label="Get In Touch"
          @click="contactDialog = true"
        ></q-btn>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import CvModal from './CVModal.vue'
import ContactModal from './ContactModal.vue'
import { ref } from 'vue'

const cvDialog = ref(false)
const contactDialog = ref(false)

const router = useRouter()
const route = useRoute()

function goTo(id) {
  // If you're already on the index route, just update the hash
  // Otherwise navigate to it with the hash
  const target = { path: '/', hash: `#${id}` }

  // Avoid redundant navigation errors if same hash
  if (route.path === '/' && route.hash === target.hash) return

  router.push(target)
}
</script>

<style scoped>
.header {
  color: black;
}

.highlight {
  color: white;
  font-family: 'Crimson Pro';
  color: var(--q-primary);
}

.header-title {
  padding-left: 50px;
  font-size: 2.5rem;
}

@media screen and (max-width: 600px) {
  .header-title {
    font-size: 1.5rem;
    padding-left: 0px;
  }
}
</style>
