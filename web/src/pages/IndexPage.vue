<template>
  <q-page class="flex justify-center" @wheel.passive="onWheel" v-touch-swipe.mouse="onSwipe">
    <terminal-header @typing-finished="typingFinished = true"></terminal-header>
    <div class="row container">
      <transition name="fade">
        <div class="section-container" v-if="typingFinished">
          <transition name="slide-up" mode="out-in">
            <component :is="activeComponent"></component>
          </transition>
        </div>
      </transition>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMeta } from 'quasar'
import TerminalHeader from 'src/components/TerminalHeader.vue'
import ProfilePageSection from 'src/components/ProfilePageSection.vue'
import StackPageSection from 'src/components/StackPageSection.vue'
import SamplesPageSection from 'src/components/SamplesPageSection.vue'

const typingFinished = ref(false)
const currentPageIndex = ref(0)
const scrollingPaused = ref(false)
const swipeInfo = ref(null)

const activeComponent = computed(() => {
  switch (currentPageIndex.value) {
    case 0:
      return ProfilePageSection
    case 1:
      return StackPageSection
    case 2:
      return SamplesPageSection
    default:
      return ProfilePageSection
  }
})

const onWheel = (event) => {
  if (!typingFinished.value) return

  if (scrollingPaused.value) return

  const delta = event.deltaY
  const sensitivityThreshold = 15
  if (Math.abs(delta) < sensitivityThreshold) return

  scrollingPaused.value = true

  if (delta > 0) {
    // Scroll down
    if (currentPageIndex.value < 2) {
      currentPageIndex.value++
    }
  } else {
    // Scroll up
    if (currentPageIndex.value > 0) {
      currentPageIndex.value--
    }
  }

  setTimeout(() => {
    scrollingPaused.value = false
  }, 500)
}

// swipe scroll for mobile
const onSwipe = (event, ...newInfo) => {
  swipeInfo.value = newInfo
  const direction = event['direction']
  switch (direction) {
    case 'up':
      if (currentPageIndex.value < 2) {
        currentPageIndex.value++
      }
      break
    case 'down':
      if (currentPageIndex.value > 0) {
        currentPageIndex.value--
      }
      break
  }
}

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
</script>

<style scoped>
.section-container {
  max-width: 600px;
  height: 400px;
}

.container {
  margin-top: 100px;
}

@media (max-width: 600px) {
  .container {
    margin-top: 100px;
  }
}

/* Vue Transition: Fade In Content */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 1.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s ease-out;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-30px);
}
</style>
