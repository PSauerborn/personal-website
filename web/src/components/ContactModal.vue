<template>
  <q-card>
    <q-card-section class="text-h6"> Get in Touch </q-card-section>
    <q-separator></q-separator>
    <q-card-section v-if="!messageSent">
      <p class="text-body1">
        Feel free to reach out if you have any questions or would like to collaborate.
      </p>
      <q-banner inline-actions rounded class="text-white bg-red q-my-lg" v-if="error">
        {{ error }}
        <template v-slot:action>
          <q-btn flat color="white" label="Dismiss" @click="error = null" />
        </template>
      </q-banner>
      <q-form v-model="formValid">
        <q-input v-model="name" label="Name" outlined dense class="q-mb-md"></q-input>
        <q-input
          v-model="email"
          label="Email"
          type="email"
          outlined
          dense
          class="q-mb-md"
        ></q-input>
        <q-input
          v-model="message"
          label="Message"
          type="textarea"
          outlined
          dense
          :autogrow="false"
          class="q-mb-md"
        ></q-input>
        <div class="row full-width flex-center">
          <q-btn
            color="primary"
            :loading="loading"
            :disable="!formValid"
            label="Send Message"
            @click="submitForm"
          ></q-btn>
        </div>
      </q-form>
    </q-card-section>
    <q-card-section v-else>
      <div class="column flex-center">
        <q-icon name="fa-solid fa-circle-check" color="primary" size="64px"></q-icon>
        <p class="text-body1 q-mt-lg">
          Thank you for your message! I will get back to you as soon as possible.
        </p>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { createContact } from 'src/api/core.js'

const name = ref('')
const email = ref('')
const message = ref('')
const loading = ref(false)
const messageSent = ref(false)
const error = ref(null)

const formValid = computed(() => {
  // check all fields are non-empty
  // and email matches basic email regex

  const emailRegex = /.+@.+\..+/
  return name.value.trim() !== '' && emailRegex.test(email.value) && message.value.trim() !== ''
})

const submitForm = () => {
  loading.value = true
  error.value = null

  createContact({
    name: name.value,
    email: email.value,
    message: message.value,
  })
    .then(() => {
      messageSent.value = true
      name.value = ''
      email.value = ''
      message.value = ''
    })
    .catch((err) => {
      error.value = 'An error occurred while sending your message. Please try again later.'
      console.error(err)
    })
    .finally(() => {
      loading.value = false
    })
}
</script>
