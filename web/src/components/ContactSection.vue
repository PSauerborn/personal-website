<template>
  <section id="contact" class="contact-section">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">Get in Touch</span>
        <h2 class="section-title">Let's Work Together</h2>
        <p class="section-description">
          Interested in discussing a project or contract opportunity? I'd love to hear from you.
        </p>
      </div>

      <div class="contact-content">
        <div class="contact-info">
          <div class="contact-card">
            <q-icon name="eva-email-outline" size="md" class="contact-icon" />
            <div>
              <h4>Email</h4>
              <a href="mailto:pascal.sauerborn@gmail.com">pascal.sauerborn@gmail.com</a>
            </div>
          </div>

          <div class="contact-card">
            <q-icon name="eva-linkedin-outline" size="md" class="contact-icon" />
            <div>
              <h4>LinkedIn</h4>
              <a
                href="https://www.linkedin.com/in/pascal-sauerborn-130452175/"
                target="_blank"
                rel="noopener"
              >
                linkedin.com/in/pascal-sauerborn-130452175
              </a>
            </div>
          </div>

          <div class="contact-card">
            <q-icon name="eva-github-outline" size="md" class="contact-icon" />
            <div>
              <h4>GitHub</h4>
              <a href="https://github.com/psauerborn" target="_blank" rel="noopener">
                github.com/psauerborn
              </a>
            </div>
          </div>

          <div class="availability-card">
            <q-icon name="eva-checkmark-circle-outline" />
            <div>
              <strong>Available for Outside IR35 Contracts</strong>
              <p>Remote or hybrid · UK & US timezones</p>
            </div>
          </div>
        </div>

        <div class="contact-form-wrapper">
          <q-form @submit="onSubmit" class="contact-form">
            <q-input v-model="form.name" label="Your Name" outlined />

            <q-input v-model="form.email" label="Email Address" type="email" outlined />

            <q-input v-model="form.company" label="Company (optional)" outlined />

            <q-select v-model="form.type" label="Enquiry Type" outlined :options="enquiryTypes" />

            <q-input
              v-model="form.message"
              label="Your Message"
              type="textarea"
              outlined
              rows="5"
            />

            <q-btn
              type="submit"
              unelevated
              color="primary"
              label="Send Message"
              icon="eva-paper-plane-outline"
              class="submit-btn"
              :loading="submitting"
              :disable="!isFormValid"
            />
          </q-form>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { createContact } from 'src/api/core.js'

const $q = useQuasar()
const submitting = ref(false)

const form = ref({
  name: '',
  email: '',
  company: '',
  type: 'Contract Opportunity',
  message: '',
})

const enquiryTypes = [
  'Contract Opportunity',
  'Full-time Position',
  'Project Consultation',
  'General Enquiry',
]

const isFormValid = computed(() => {
  const emailRegex = /.+@.+\..+/
  return (
    form.value.name.trim() !== '' &&
    form.value.email.trim() !== '' &&
    emailRegex.test(form.value.email) &&
    form.value.message.trim() !== ''
  )
})

const onSubmit = async () => {
  submitting.value = true

  try {
    await createContact({
      name: form.value.name,
      email: form.value.email,
      message: `[${form.value.type}]${form.value.company ? ` (${form.value.company})` : ''}\n\n${form.value.message}`,
    })

    $q.notify({
      type: 'positive',
      message: "Message sent successfully! I'll get back to you soon.",
      position: 'top',
      timeout: 4000,
    })

    form.value = {
      name: '',
      email: '',
      company: '',
      type: 'Contract Opportunity',
      message: '',
    }
  } catch (error) {
    console.error('Failed to send message:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to send message. Please try again or email me directly.',
      position: 'top',
      timeout: 5000,
    })
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="scss" scoped>
.contact-section {
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
  margin: 0 0 16px;
}

.section-description {
  font-size: 1.1rem;
  color: var(--s31-muted);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

.contact-content {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 48px;
  max-width: 1000px;
  margin: 0 auto;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.contact-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contact-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 12px;
  padding: 20px;

  .contact-icon {
    color: $primary;
    flex-shrink: 0;
    margin-top: 2px;
  }

  h4 {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--s31-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 4px;
  }

  a {
    color: var(--s31-text);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s ease;
    &:hover {
      color: $primary;
    }
  }
}

.availability-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: rgba(46, 125, 90, 0.08);
  border: 1px solid rgba(46, 125, 90, 0.2);
  border-radius: 12px;
  padding: 20px;
  margin-top: 8px;

  .q-icon {
    color: $positive;
    flex-shrink: 0;
    font-size: 1.4rem;
    margin-top: 2px;
  }
  strong {
    display: block;
    color: $positive;
    margin-bottom: 4px;
  }
  p {
    color: var(--s31-muted);
    font-size: 0.9rem;
    margin: 0;
  }
}

.contact-form-wrapper {
  background: var(--s31-paper);
  border: 1px solid var(--s31-border);
  border-radius: 16px;
  padding: 32px;
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.submit-btn {
  align-self: flex-start;
  padding: 14px 32px;
  font-weight: 600;
  border-radius: 12px;
  text-transform: none;
  font-size: 1rem;
  margin-top: 8px;

  @media (max-width: 600px) {
    width: 100%;
    align-self: stretch;
  }
}
</style>
