<template>
  <section class="hero-section">
    <div class="hero-content">
      <div class="hero-text">
        <div class="availability-badge">
          <span class="pulse"></span>
          Available for Contract Work
        </div>
        <h1 class="hero-title">Senior Software & DevOps Engineer</h1>
        <p class="hero-subtitle">
          Backend & Cloud Infrastructure specialist with 5+ years of experience building scalable,
          production-grade systems. Currently seeking
          <strong>Outside IR35 contracts</strong> in the <strong>UK and US</strong>.
        </p>

        <!-- Tech Stack -->
        <div class="tech-stack">
          <span class="stack-label">Core Stack</span>
          <div class="stack-items">
            <div class="stack-item" v-for="tech in techStack" :key="tech.name">
              <img :src="tech.icon" :alt="tech.name" class="stack-icon" />
              <span class="stack-name">{{ tech.name }}</span>
            </div>
          </div>
        </div>

        <div class="hero-actions">
          <q-btn
            unelevated
            color="primary"
            label="View CV"
            icon="eva-file-text-outline"
            class="hero-btn primary-btn"
            @click="$emit('scroll', 'cv')"
          />
          <q-btn
            outline
            color="primary"
            label="Get in Touch"
            icon="eva-paper-plane-outline"
            class="hero-btn"
            @click="$emit('scroll', 'contact')"
          />
        </div>
      </div>
      <div class="hero-image">
        <div class="image-wrapper">
          <img src="/profile.png" alt="Pascal Sauerborn" class="profile-image" />
          <div class="image-decoration"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
defineEmits(['scroll'])

const techStack = [
  {
    name: 'Golang',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original-wordmark.svg',
  },
  {
    name: 'Terraform',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/terraform/terraform-original.svg',
  },
  {
    name: 'Kubernetes',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kubernetes/kubernetes-plain.svg',
  },
  {
    name: 'AWS',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg',
  },
]
</script>

<style lang="scss" scoped>
.hero-section {
  min-height: calc(100vh - 70px);
  display: flex;
  align-items: center;
  padding: 80px 24px;
  background: linear-gradient(135deg, var(--s31-paper) 0%, var(--s31-surface) 100%);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 70%;
    height: 200%;
    background: radial-gradient(circle, rgba(198, 90, 30, 0.06) 0%, transparent 70%);
    pointer-events: none;
  }
}

.hero-content {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
  position: relative;
  z-index: 1;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    text-align: center;
    gap: 48px;
  }
}

.hero-text {
  @media (max-width: 900px) {
    order: 2;
  }
}

.availability-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(46, 125, 90, 0.12);
  color: $positive;
  padding: 8px 16px;
  border-radius: 24px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 24px;

  .pulse {
    width: 8px;
    height: 8px;
    background: $positive;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

.hero-title {
  font-family: $font-family-header;
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 700;
  color: var(--s31-text);
  margin: 0 0 20px;
  line-height: 1.1;
}

.hero-subtitle {
  font-size: 1.15rem;
  color: var(--s31-muted);
  line-height: 1.7;
  margin: 0 0 24px;
  max-width: 520px;

  strong {
    color: $primary;
    font-weight: 600;
  }

  @media (max-width: 900px) {
    max-width: none;
  }
}

.tech-stack {
  margin-bottom: 32px;

  @media (max-width: 900px) {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
}

.stack-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--s31-muted);
  margin-bottom: 12px;
}

.stack-items {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;

  @media (max-width: 600px) {
    justify-content: center;
    gap: 12px;
  }
}

.stack-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 12px;
  padding: 10px 16px;
  transition: all 0.2s ease;

  &:hover {
    border-color: $primary;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(198, 90, 30, 0.15);
  }

  @media (max-width: 600px) {
    padding: 8px 12px;
  }
}

.stack-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;

  @media (max-width: 600px) {
    width: 24px;
    height: 24px;
  }
}

.stack-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--s31-text);

  @media (max-width: 600px) {
    font-size: 0.8rem;
  }
}

.hero-actions {
  display: flex;
  gap: 16px;

  @media (max-width: 600px) {
    flex-direction: column;
    width: 100%;
  }

  @media (max-width: 900px) and (min-width: 601px) {
    justify-content: center;
    flex-wrap: wrap;
  }
}

.hero-btn {
  padding: 12px 28px;
  font-weight: 600;
  border-radius: 12px;
  text-transform: none;
  font-size: 1rem;

  @media (max-width: 600px) {
    width: 100%;
  }
}

.primary-btn {
  box-shadow: 0 4px 14px rgba(198, 90, 30, 0.3);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(198, 90, 30, 0.4);
  }
}

.hero-image {
  display: flex;
  justify-content: center;

  @media (max-width: 900px) {
    order: 1;
  }
}

.image-wrapper {
  position: relative;
  width: 320px;
  height: 320px;

  @media (max-width: 600px) {
    width: 240px;
    height: 240px;
  }
}

.profile-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 24px;
  border: 4px solid var(--s31-surface);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  position: relative;
  z-index: 2;
}

.image-decoration {
  position: absolute;
  top: 16px;
  left: 16px;
  right: -16px;
  bottom: -16px;
  background: linear-gradient(135deg, $primary 0%, $accent 100%);
  border-radius: 24px;
  opacity: 0.15;
  z-index: 1;
}
</style>
