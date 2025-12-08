<template>
  <q-page class="flex flex-center" @wheel.passive="onWheel">
    <div class="row" style="max-width: 600px">
      <div
        class="terminal-header"
        :class="{
          'in-center': animationState === 'typing',
          'at-top': animationState !== 'typing',
          finished: animationState === 'finished',
        }"
      >
        <p class="terminal-text">
          <span class="prefix"> > </span>
          {{ displayedText }}
          <span class="cursor" :class="{ blinking: showCursor }">|</span>
        </p>
      </div>

      <transition name="fade">
        <div class="column" v-if="animationState === 'finished'">
          <div class="section-container">
            <transition name="slide-up">
              <component :is="activeComponent" />
            </transition>
          </div>
        </div>
      </transition>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import IntroPageSection from 'src/components/IntroPageSection.vue'
import DetailsPageSection from 'src/components/DetailsPageSection.vue'
import ProfilePageSection from 'src/components/ProfilePageSection.vue'

// Configuration
const textToType = 'Computer Says Hello...'
const typingSpeed = 100 // ms per character
const pauseBeforeMove = 1000 // ms to wait after typing finishes

// Reactive State
const displayedText = ref('')
const showCursor = ref(true)
const animationState = ref('typing') // 'typing' | 'moving' | 'finished'
const pageIndex = ref(0)
const scrollingEnabled = ref(true)

const activeComponent = computed(() => {
  const mappings = {
    0: IntroPageSection,
    1: DetailsPageSection,
    2: ProfilePageSection,
  }
  return mappings[pageIndex.value]
})

const typeText = () => {
  let charIndex = 0

  const typeChar = () => {
    if (charIndex < textToType.length) {
      displayedText.value += textToType.charAt(charIndex)
      charIndex++
      setTimeout(typeChar, typingSpeed)
    } else {
      // Typing finished
      finishTyping()
    }
  }

  typeChar()
}

const finishTyping = () => {
  // Stop the cursor blinking eventually, or keep it.
  // Here we wait a moment, then move the text.
  setTimeout(() => {
    animationState.value = 'moving'

    // Allow time for the CSS transition (1s) to complete before showing content
    setTimeout(() => {
      animationState.value = 'finished'
    }, 1000)
  }, pauseBeforeMove)
}

const onWheel = (e) => {
  const sensitivity = 15
  if (Math.abs(e.deltaY) < sensitivity) return

  if (!scrollingEnabled.value) return
  // Disable further scrolling until animation completes
  scrollingEnabled.value = false

  if (e.deltaY > 0) {
    if (pageIndex.value >= 2) return
    pageIndex.value++
  } else if (e.deltaY < 0) {
    if (pageIndex.value <= 0) return
    pageIndex.value--
  }

  setTimeout(() => {
    scrollingEnabled.value = true
  }, 500) // Match this duration with any scroll animation duration if needed
}

onMounted(() => {
  typeText()
})
</script>

<style scoped>
.section-container {
  width: 600px;
  height: 400px;
}

/* THE HEADER TRANSITION
   We use Fixed positioning to easily animate from center viewport
   to top viewport without affecting document flow.
*/
.terminal-header {
  font-family: 'Fira Code', monospace;
  position: fixed;
  left: 50%;
  transform: translateX(-50%); /* Always center horizontally */
  transition: all 1s cubic-bezier(0.19, 1, 0.22, 1); /* Smooth 'ease-out' like effect */
  z-index: 10;
  width: 100%;
  text-align: center;
}

/* State: Centered (Typing) */
.terminal-header.in-center {
  top: 50%;
  transform: translate(-50%, -50%); /* Center perfectly vertically & horizontally */
}

/* State: At Top (Moving/Finished) */
.terminal-header.at-top {
  top: 20px; /* Distance from top */
  transform: translate(-50%, 0); /* Keep horizontal center, remove vertical offset */
  margin-bottom: 100px;
}

.terminal-header.finished {
  top: 20px; /* Distance from top */
  transform: translate(-50%, 0); /* Keep horizontal center, remove vertical offset */
  margin-bottom: 100px;
  position: relative;
}

/* Typography Scaling */
.terminal-text {
  margin: 0;
  transition: font-size 1s ease;
}

.terminal-header.in-center .terminal-text {
  font-size: 3rem; /* Large text while typing */
}

.terminal-header.at-top .terminal-text {
  font-size: 1.5rem; /* Smaller text at top */
}

/* Cursor Animation */
.cursor {
  display: inline-block;
  opacity: 1;
}
.cursor.blinking {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
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
  transition: all 0.5s ease-out;
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
