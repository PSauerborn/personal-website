<template>
  <div class="container q-pa-md">
    <q-card class="card">
      <q-card-section>
        <div class="row">
          <div class="col">
            <p class="text-h5"><span class="highlight">Abo</span>ut Me</p>
            <q-separator class="q-my-md"></q-separator>
          </div>
        </div>
        <div class="row">
          <p class="text-body1">
            A theoretical physicist turned Backend / DevOps Engineer who builds cloud-native
            platforms end-to-end—from architecture and infrastructure to production operations. I've
            spent 7+ years shipping high-throughput APIs, data platforms, and automation pipelines
            across AWS and Azure, with a focus on Go, Python, Terraform, Kubernetes, and CI/CD.
          </p>

          <p class="text-body1">
            Most recently, I've been the backend engineer for the DiscoverMe Study at Omnigen
            Biodata, delivering systems that serve 3M+ health records and ancestry insights to 200k+
            users across the UK and South Africa, plus ETL pipelines processing 4TB+ of data from
            multiple third-party providers.
          </p>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.container {
  max-width: 600px;
  margin-top: 30px;
}

@media screen and (min-width: 600px) {
  .container {
    margin-top: 100px;
  }
}

.highlight {
  color: var(--q-primary);
}
</style>
