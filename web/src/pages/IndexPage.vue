<template>
  <q-page class="flex flex-center">
    <div class="column flex flex-center">
      <profile-page-section id="profile"></profile-page-section>
      <about-me-page-section id="about-me"></about-me-page-section>
      <experience-section id="experience"></experience-section>
      <portfolio-page-section id="portfolio"></portfolio-page-section>
    </div>
  </q-page>
</template>

<script setup>
import { useMeta } from 'quasar'
import { onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { scroll } from 'quasar'
import ProfilePageSection from 'src/components/ProfilePageSection.vue'
import AboutMePageSection from 'src/components/AboutMePageSection.vue'
import ExperienceSection from 'src/components/ExperienceSection.vue'
import PortfolioPageSection from 'src/components/PortfolioPageSection.vue'

useMeta({
  title: 'Pascal Sauerborn | Profile',
  meta: [
    {
      name: 'description',
      content:
        'Profile page of Pascal Sauerborn, showcasing skills and experience as a Backend Developer and Infrastructure Engineer.',
    },
  ],
})

const route = useRoute()
const { getScrollTarget, setVerticalScrollPosition } = scroll

function scrollToHash(hash) {
  if (!hash) return
  const id = hash.replace('#', '')
  const el = document.getElementById(id)

  if (!el) return

  const target = getScrollTarget(el)
  const offset = el.offsetTop

  // Adjust for fixed header height (tune this)
  const headerOffset = 64

  setVerticalScrollPosition(target, offset - headerOffset, 200)
}

onMounted(async () => {
  await nextTick()
  scrollToHash(route.hash)
})

watch(
  () => route.hash,
  async (h) => {
    await nextTick()
    scrollToHash(h)
  },
)
</script>

<style scoped></style>
