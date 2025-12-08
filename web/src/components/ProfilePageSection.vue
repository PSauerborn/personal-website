<template>
  <div class="container">
    <div class="row flex-center">
      <div class="col-3">
        <q-avatar size="80px" class="q-mr-md">
          <img src="profile.png" alt="Pascal Sauerborn Avatar" />
        </q-avatar>
      </div>

      <div class="col-8 q-mx-lg flex-grow">
        <div class="column">
          <p class="text-h3">Pascal Sauerborn</p>
          <p class="text-body1">Backend Developer & Infrastructure Engineer</p>
        </div>
        <div class="row">
          <q-icon name="fa-solid fa-mobile" size="xs"></q-icon>
          <p class="text-body1 q-mx-lg">+44 (755) 535-9275</p>
        </div>
        <div class="row">
          <q-icon name="fa-solid fa-at" size="xs"></q-icon>
          <p class="text-body1 q-mx-lg">pascal.sauerborn@gmail.com</p>
        </div>
        <div class="row q-mt-md">
          <q-icon name="fa-brands fa-github" size="lg"></q-icon>
          <q-icon class="q-mx-lg" name="fa-brands fa-linkedin" size="lg"></q-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup></script>

<style scoped>
.container {
  position: absolute;
  max-width: 600px;
}
</style>
