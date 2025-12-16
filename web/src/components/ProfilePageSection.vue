<template>
  <div class="row flex-center q-mt-xl container">
    <q-dialog v-model="cvDialog">
      <cv-modal></cv-modal>
    </q-dialog>

    <q-dialog v-model="contactDialog">
      <contact-modal></contact-modal>
    </q-dialog>

    <div class="col-xs-12 col-sm-12 col-lg-4 col-md-4 flex flex-center q-mx-xl image-container">
      <q-img fit="contain" src="profile.png" alt="Pascal Sauerborn Avatar" class="profile-img" />
    </div>
    <div class="col flex flex-column q-mx-xl">
      <div class="row dense">
        <p class="text-h3">Hi, I'm <span class="highlight">Pascal.</span></p>
      </div>
      <div class="row dense">
        <p class="text-body1">
          Backend Software Engineer, Infrastructure Specialist & Founder. I have over 7+ years
          industry experience working with Python, Go and Terraform, working in everything from
          large energy corporations to protein-folding startups.
        </p>
      </div>
      <div class="row dense">
        <p class="text-body1">Outside IR35 Contractor | UK & US Based</p>
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
          class="q-mr-sm gt-sm q-px-xl tonal-button"
          label="View CV"
          @click="cvDialog = true"
          color="primary"
          outline
          no-caps
        ></q-btn>
        <q-btn
          label="Get In Touch"
          class="gt-sm q-px-xl"
          @click="contactDialog = true"
          color="secondary"
          no-caps
        ></q-btn>
      </div>
      <div class="row full-width lt-md">
        <q-btn
          class="q-mt-md full-width"
          label="View CV"
          @click="cvDialog = true"
          color="primary"
          outline
          no-caps
          full-width
        ></q-btn>
        <q-btn
          label="Get In Touch"
          class="q-mt-md q-mb-lg full-width"
          @click="contactDialog = true"
          color="secondary"
          no-caps
          full-width
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
.profile-img {
  width: 250px;
  height: 250px;
  border-radius: 10px;
}

@media screen and (max-width: 600px) {
  .profile-img {
    width: 200px;
    height: 200px;
    margin-bottom: 50px;
  }
}

.container {
  max-width: 1000px;
}

.icon-btn {
  cursor: pointer;
}

.icon-btn:hover {
  color: var(--q-primary);
}

.highlight {
  color: var(--q-primary);
}
</style>
