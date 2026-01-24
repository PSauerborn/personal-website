<template>
  <section id="about" class="about-section">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">About Me</span>
        <h2 class="section-title">Building Robust Backend Systems</h2>
      </div>

      <div class="about-content">
        <div class="about-text">
          <p class="about-intro">
            I'm a Senior Software & DevOps Engineer with a passion for designing and implementing
            scalable backend systems and cloud infrastructure. With a background in Theoretical
            Physics & Mathematics, I combine analytical rigour and a knack for delivery.
          </p>
          <p>
            My expertise spans the full backend stack—from REST APIs and GraphQL services to ETL
            pipelines and data lakes. Most recently, I've been working in healthcare and genomics,
            delivering scalable systems serving 200k+ users and processing 4TB+ of health and
            genomic data.
          </p>
          <p>
            I specialize in Golang and Python, with a deep, industry-tested understanding of AWS.
            Terraform and Kubernetes form the two central pillars of any DevOps work that I do
            (including this website). When it comes to databases, DynamoDB and PostgreSQL make up
            the bulk of my professional experience.
          </p>

          <div class="contract-notice">
            <q-icon name="eva-briefcase-outline" size="sm" />
            <div>
              <strong>Currently seeking Outside IR35 contracts</strong>
              <span>Available for remote and hybrid roles across the UK and US markets.</span>
            </div>
          </div>
        </div>

        <!-- Skill Wheel (Desktop) -->
        <div class="skill-wheel-container desktop-wheel">
          <div class="skill-wheel">
            <!-- Center circle -->
            <div class="wheel-center">
              <span class="center-text">Skills</span>
            </div>

            <!-- Skill segments -->
            <div
              v-for="(skillGroup, index) in skills"
              :key="skillGroup.name"
              class="skill-segment"
              :class="{ active: activeSegment === index }"
              :style="getSegmentStyle(index)"
              @mouseenter="activeSegment = index"
              @mouseleave="activeSegment = null"
            >
              <div class="segment-label" :style="getLabelStyle(index)">
                <span class="segment-name">{{ skillGroup.name }}</span>
                <span class="segment-count">{{ skillGroup.items.length }}</span>
              </div>
            </div>

            <!-- Skill items orbital rings -->
            <div
              v-for="(skillGroup, groupIndex) in skills"
              :key="`items-${skillGroup.name}`"
              class="skill-items-ring"
              :class="{ visible: activeSegment === groupIndex }"
            >
              <div
                v-for="(skill, skillIndex) in skillGroup.items"
                :key="skill"
                class="skill-item"
                :style="getSkillItemStyle(skillIndex, skillGroup.items.length, groupIndex)"
              >
                {{ skill }}
              </div>
            </div>
          </div>

          <!-- Active skill details -->
          <div class="skill-details q-mt-xl" :class="{ visible: activeSegment !== null }">
            <template v-if="activeSegment !== null">
              <h4 class="details-title">{{ skills[activeSegment].name }}</h4>
              <div class="details-items">
                <span v-for="skill in skills[activeSegment].items" :key="skill" class="detail-tag">
                  {{ skill }}
                </span>
              </div>
            </template>
            <template v-else>
              <p class="details-hint">Hover over a segment to explore skills</p>
            </template>
          </div>
        </div>

        <!-- Skills Grid (Mobile) -->
        <div class="skills-grid-mobile">
          <div
            v-for="skillGroup in skills"
            :key="`mobile-${skillGroup.name}`"
            class="skill-group-mobile"
          >
            <h4 class="skill-group-title">{{ skillGroup.name }}</h4>
            <div class="skill-tags-mobile">
              <span v-for="skill in skillGroup.items" :key="skill" class="skill-tag-mobile">
                {{ skill }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  skills: { type: Array, required: true },
})

const activeSegment = ref(null)

const segmentAngle = computed(() => 360 / props.skills.length)

const getSegmentStyle = (index) => {
  const angle = segmentAngle.value * index - 90
  const hue = index * 40 + 20 // Warm color palette
  return {
    '--segment-rotation': `${angle}deg`,
    '--segment-angle': `${segmentAngle.value}deg`,
    '--segment-color': `hsl(${hue}, 70%, 50%)`,
    '--segment-color-light': `hsl(${hue}, 70%, 95%)`,
  }
}

const getLabelStyle = (index) => {
  const angle = segmentAngle.value * index + segmentAngle.value / 2 - 90
  const radius = 120
  const x = Math.cos((angle * Math.PI) / 180) * radius
  const y = Math.sin((angle * Math.PI) / 180) * radius
  return {
    transform: `translate(${x}px, ${y}px)`,
  }
}

const getSkillItemStyle = (skillIndex, totalSkills, groupIndex) => {
  const baseAngle = segmentAngle.value * groupIndex - 90
  const spreadAngle = segmentAngle.value * 0.8
  const startAngle = baseAngle + segmentAngle.value * 0.1
  const angleStep = totalSkills > 1 ? spreadAngle / (totalSkills - 1) : 0
  const angle = startAngle + angleStep * skillIndex
  const radius = 180
  const x = Math.cos((angle * Math.PI) / 180) * radius
  const y = Math.sin((angle * Math.PI) / 180) * radius
  return {
    transform: `translate(${x}px, ${y}px)`,
    transitionDelay: `${skillIndex * 50}ms`,
  }
}
</script>

<style lang="scss" scoped>
.about-section {
  padding: 100px 24px;
  background: var(--s31-surface);
}

.section-container {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  text-align: center;
  margin-bottom: 48px;
}

.section-label {
  display: inline-block;
  color: $primary;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.section-title {
  font-family: $font-family-header;
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 700;
  color: var(--s31-text);
  margin: 0;
}

.about-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: start;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
    gap: 48px;
  }
}

.about-text {
  p {
    font-size: 1.05rem;
    line-height: 1.8;
    color: var(--s31-text);
    margin: 0 0 20px;

    &.about-intro {
      font-size: 1.15rem;
      font-weight: 500;
    }
  }
}

.contract-notice {
  display: flex;
  gap: 16px;
  background: rgba(198, 90, 30, 0.08);
  border: 1px solid rgba(198, 90, 30, 0.2);
  border-radius: 12px;
  padding: 20px;
  margin-top: 28px;

  .q-icon {
    color: $primary;
    flex-shrink: 0;
    margin-top: 2px;
  }
  strong {
    display: block;
    color: $primary;
    margin-bottom: 4px;
  }
  span {
    color: var(--s31-muted);
    font-size: 0.95rem;
  }
}

// Skill Wheel Styles (Desktop)
.desktop-wheel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;

  @media (max-width: 600px) {
    display: none;
  }
}

// Skills Grid (Mobile)
.skills-grid-mobile {
  display: none;
  flex-direction: column;
  gap: 16px;
  width: 100%;

  @media (max-width: 600px) {
    display: flex;
  }
}

.skill-group-mobile {
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 12px;
  padding: 16px;
}

.skill-group-title {
  font-family: $font-family-header;
  font-size: 0.9rem;
  font-weight: 600;
  color: $primary;
  margin: 0 0 12px;
}

.skill-tags-mobile {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-tag-mobile {
  background: rgba(198, 90, 30, 0.1);
  color: $primary;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.skill-wheel {
  position: relative;
  width: 320px;
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wheel-center {
  position: absolute;
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, $primary, $accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: 0 4px 20px rgba(198, 90, 30, 0.3);

  .center-text {
    color: white;
    font-family: $font-family-header;
    font-weight: 700;
    font-size: 1rem;
  }
}

.skill-segment {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 140px;
    height: 140px;
    background: var(--segment-color-light);
    border: 2px solid var(--segment-color);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.3;
    transition: all 0.3s ease;
  }

  &.active::before {
    width: 160px;
    height: 160px;
    opacity: 0.6;
    box-shadow: 0 0 30px var(--segment-color);
  }
}

.segment-label {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  cursor: pointer;
  padding: 12px 16px;
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 12px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  white-space: nowrap;

  &:hover {
    background: var(--s31-surface);
    border-color: $primary;
    transform: translate(var(--tx, 0), var(--ty, 0)) scale(1.05);
    box-shadow: 0 4px 16px rgba(198, 90, 30, 0.15);
  }

  .segment-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--s31-text);
    text-align: center;
  }

  .segment-count {
    font-size: 0.7rem;
    color: $primary;
    font-weight: 700;
  }
}

.skill-items-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;

  &.visible {
    opacity: 1;
  }
}

.skill-item {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: 6px 12px;
  background: $primary;
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 20px;
  white-space: nowrap;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.8);
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(198, 90, 30, 0.3);

  .skill-items-ring.visible & {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.skill-details {
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 16px;
  padding: 24px;
  min-height: 120px;
  width: 100%;
  max-width: 400px;
  text-align: center;
  transition: all 0.3s ease;
  opacity: 0.6;

  &.visible {
    opacity: 1;
    border-color: $primary;
  }

  .details-title {
    font-family: $font-family-header;
    font-size: 1.1rem;
    font-weight: 700;
    color: $primary;
    margin: 0 0 16px;
  }

  .details-items {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .detail-tag {
    background: rgba(198, 90, 30, 0.1);
    color: $primary;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.2s ease;

    &:hover {
      background: $primary;
      color: white;
    }
  }

  .details-hint {
    color: var(--s31-muted);
    font-size: 0.9rem;
    margin: 0;
    font-style: italic;
  }
}
</style>
