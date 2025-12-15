<template>
  <div class="row flex-center">
    <q-dialog v-model="cvDialog">
      <cv-modal></cv-modal>
    </q-dialog>

    <q-dialog v-model="contactDialog">
      <contact-modal></contact-modal>
    </q-dialog>

    <div class="col-2-md col-2-lg col-2-sm col-12-xs q-mb-xl">
      <q-avatar size="80px" class="q-mr-md">
        <img src="profile.png" alt="Pascal Sauerborn Avatar" />
      </q-avatar>
    </div>

    <div class="col-8-md col-8-lg col-8-sm col-12-xs q-mx-lg">
      <div class="row">
        <p class="text-h3">Pascal Sauerborn</p>
      </div>

      <div class="wrapper">
        <transition name="slide-right">
          <div class="container" v-if="currentTitleIndex === 0">
            <p class="text-body1 text-weight-bold">{{ jobTitles[currentTitleIndex] }}.</p>
          </div>
          <div class="container" v-else-if="currentTitleIndex === 1">
            <p class="text-body1 text-weight-bold">{{ jobTitles[currentTitleIndex] }}.</p>
          </div>
          <div class="container" v-else-if="currentTitleIndex === 2">
            <p class="text-body1 text-weight-bold">{{ jobTitles[currentTitleIndex] }}.</p>
          </div>
        </transition>
      </div>
      <q-separator class="q-my-md"></q-separator>
      <div class="row dense">
        <p class="text-body1">Outside IR35 Contractor | UK & US Based</p>
      </div>
      <div class="row dense">
        <p class="text-body1">7+ years industry experience working with Python, Go and Terraform</p>
      </div>
      <div class="row dense q-mt-md">
        <q-icon name="fa-solid fa-mobile" size="xs"></q-icon>
        <p class="text-body1 q-mx-lg">+44 (755) 535-9275</p>
      </div>
      <div class="row dense">
        <q-icon name="fa-solid fa-at" size="xs"></q-icon>
        <p class="text-body1 q-mx-lg">pascal.sauerborn@gmail.com</p>
      </div>
      <div class="row q-mt-md">
        <q-icon
          name="fa-brands fa-github"
          class="q-mr-md icon-btn"
          size="lg"
          @click="openLink('https://github.com/psauerborn')"
        ></q-icon>
        <q-icon
          class="q-mr-md icon-btn"
          name="fa-brands fa-linkedin"
          size="lg"
          @click="openLink('https://www.linkedin.com/in/pascal-sauerborn-130452175/')"
        ></q-icon>
        <q-btn
          class="q-mr-sm gt-xs"
          label="View CV"
          @click="cvDialog = true"
          color="grey-5"
          no-caps
        ></q-btn>
        <q-btn
          label="Contact"
          class="gt-xs"
          @click="contactDialog = true"
          color="grey-7"
          no-caps
        ></q-btn>
      </div>
      <div class="row q-mt-xl lt-sm">
        <q-btn
          class="full-width q-mb-md"
          label="View CV"
          @click="cvDialog = true"
          color="grey-5"
          rounded
          size="large"
          no-caps
        ></q-btn>
        <q-btn
          label="Contact"
          class="full-width"
          @click="contactDialog = true"
          color="grey-7"
          size="large"
          rounded
          no-caps
        ></q-btn>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import CvModal from 'src/components/CVModal.vue'
import ContactModal from 'src/components/ContactModal.vue'

const jobTitles = ['Backend Developer', 'Infrastructure Engineer', 'Founder']

const currentTitleIndex = ref(0)
const cvDialog = ref(false)
const contactDialog = ref(false)

const openLink = (url) => {
  window.open(url, '_blank')
}

onMounted(() => {
  setInterval(() => {
    currentTitleIndex.value = (currentTitleIndex.value + 1) % jobTitles.length
  }, 3000)
})
</script>

<style scoped>
.wrapper {
  position: relative;
  height: 40px;
  display: flex;
}

.container {
  position: absolute;
  display: inline-flex;
  align-items: flex-end;
  gap: 8px;
  height: 40px;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.25s ease-out;
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.icon-btn {
  cursor: pointer;
}
</style>
