<template>
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
</template>

<script setup>
import { ref, onMounted } from 'vue'

// Configuration
const textToType = 'Computer Says Hello...'
const typingSpeed = 100 // ms per character
const pauseBeforeMove = 1000 // ms to wait after typing finishes

// Reactive State
const displayedText = ref('')
const showCursor = ref(true)
const animationState = ref('typing') // 'typing' | 'moving' | 'finished'

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

const emits = defineEmits(['typingFinished'])

const finishTyping = () => {
  // Stop the cursor blinking eventually, or keep it.
  // Here we wait a moment, then move the text.
  setTimeout(() => {
    animationState.value = 'moving'

    // Allow time for the CSS transition (1s) to complete before showing content
    setTimeout(() => {
      animationState.value = 'finished'
      emits('typingFinished')
    }, 1000)
  }, pauseBeforeMove)
}

onMounted(() => {
  typeText()
})
</script>

<style scoped>
/* THE HEADER TRANSITION
   We use Fixed positioning to easily animate from center viewport
   to top viewport without affecting document flow.
*/
.terminal-header {
  font-family: 'Tanker', monospace;
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
  transform: translate(-61%, 0); /* Keep horizontal center, remove vertical offset */
  margin-bottom: 100px;
}

/* increase translation on mobile screens */
@media (max-width: 600px) {
  .terminal-header.at-top {
    transform: translate(-50%, 0px);
    margin-bottom: 20px;
  }

  .terminal-header.finished {
    transform: translate(-75%, 0px);
    margin-bottom: 20px;
  }
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

@media (max-width: 600px) {
  .terminal-header.in-center .terminal-text {
    font-size: 1.25rem;
  }

  .terminal-header.at-top .terminal-text {
    font-size: 1.25rem;
  }
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
</style>
