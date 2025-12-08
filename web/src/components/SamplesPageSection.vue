<template>
  <div class="column q-pa-lg">
    <p class="text-h4">Portfolio</p>
    <p class="text-body1">
      This website is designed to be a showcase of what and how I deliver. The app itself is written
      using <span class="stack-title">VueJS</span>
      <q-img src="vue-svgrepo-com.svg" class="inline-image"></q-img> and is served by a
      <span class="stack-title">Golang</span>
      <q-img src="go-svgrepo-com.svg" class="inline-image"></q-img> backend. A
      <span class="stack-title">PostgreSQL</span>
      <q-img src="postgresql-logo-svgrepo-com.svg" class="inline-image"></q-img> database is used
      for data storage.
    </p>
    <p class="text-body1">
      The entire application is deployed to a <span class="stack-title">Kubernetes</span>
      <q-img src="kubernetes-svgrepo-com.svg" class="inline-image"></q-img> cluster. All
      infrastructure is provisioned using <span class="stack-title">Terraform</span>
      <q-img src="terraform-svgrepo-com.svg" class="inline-image"></q-img>, with a complete set of
      <span class="stack-title">Github Actions</span>
      <q-img src="github-color-svgrepo-com.svg" class="inline-image"></q-img> that manage everything
      from testing to deployment. A full <span class="stack-title">dev</span> and
      <span class="stack-title">prod</span> environment is maintained to ensure stability and
      reliability.
    </p>
    <p class="text-body1">
      The entire codebase including detailed documentation is stored in a public GitHub repository.
    </p>
    <div class="row full-width flex-center q-mt-lg">
      <q-btn
        color="grey-8"
        label="View on GitHub"
        icon="fa-brands fa-github"
        target="_blank"
        href="https://github.com/psauerborn/personal-website"
      ></q-btn>
    </div>
  </div>
</template>

<script setup></script>

<style scoped>
.inline-image {
  width: 24px;
  height: 24px;
  vertical-align: middle;
  margin-left: 4px;
}

.stack-title {
  font-family: 'Tanker';
}
</style>
