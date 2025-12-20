<template>
  <div class="container q-pa-md">
    <q-card>
      <q-card-section>
        <div class="row">
          <div class="col">
            <p class="text-h5"><span class="highlight">Por</span><span>tfolio</span></p>
            <q-separator class="q-my-md"></q-separator>
          </div>
        </div>
        <div class="row">
          <p class="text-body1">
            This website is designed to be a showcase of what and how I deliver. The app itself is
            written using <span class="stack-title">VueJS</span>
            <q-img src="vue-svgrepo-com.svg" class="inline-image"></q-img> and is served by a
            <span class="stack-title">Golang</span>
            <q-img src="go-svgrepo-com.svg" class="inline-image"></q-img> backend. A
            <span class="stack-title">PostgreSQL</span>
            <q-img src="postgresql-logo-svgrepo-com.svg" class="inline-image"></q-img> database is
            used for data storage.
          </p>
          <p class="text-body1">
            The entire application is deployed to a <span class="stack-title">Kubernetes</span>
            <q-img src="kubernetes-svgrepo-com.svg" class="inline-image"></q-img> cluster running on
            a remote server. All infrastructure is provisioned using
            <span class="stack-title">Terraform</span>
            <q-img src="terraform-svgrepo-com.svg" class="inline-image"></q-img>, with a complete
            set of
            <span class="stack-title">Github Actions</span>
            <q-img src="github-color-svgrepo-com.svg" class="inline-image"></q-img> that manage
            everything from testing to deployment. A full <span class="stack-title">dev</span> and
            <span class="stack-title">prod</span> environment is maintained to ensure stability and
            reliability.
          </p>
          <p class="text-body1">
            The entire codebase including detailed documentation is stored in a public GitHub
            repository. Feel free to browse through the code to see how everything is structured and
            implemented.
          </p>
        </div>
        <div class="row flex-center q-mt-lg">
          <q-btn
            color="secondary"
            label="View on GitHub"
            icon="fa-brands fa-github"
            target="_blank"
            href="https://github.com/psauerborn/personal-website"
            no-caps
          ></q-btn>
        </div>
      </q-card-section>
    </q-card>
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
  font-family: 'Avenir', serif;
  font-weight: 600;
  color: var(--q-secondary);
}

.highlight {
  color: var(--q-primary);
}

.container {
  max-width: 600px;
}
</style>
