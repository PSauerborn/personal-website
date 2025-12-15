<template>
  <div class="column q-pa-lg">
    <p class="text-h4">Core Tech Stack</p>
    <q-separator class="q-my-md"></q-separator>
    <div class="row q-mt-lg flex-center">
      <div
        v-for="tech in techStack"
        :key="tech.name"
        class="col-4 flex flex-center q-ma-md"
        style="max-width: 120px"
      >
        <q-img :src="tech.logo" :alt="tech.name + ' logo'" class="icon" contain></q-img>
      </div>
    </div>
  </div>
</template>

<script setup>
const techStack = [
  { name: 'Python', logo: 'python-svgrepo-com.svg' },
  { name: 'Golang', logo: 'go-svgrepo-com.svg' },
  { name: 'Terraform', logo: 'terraform-svgrepo-com.svg' },
  { name: 'Docker', logo: 'docker-svgrepo-com.svg' },
  { name: 'Kubernetes', logo: 'kubernetes-svgrepo-com.svg' },
  { name: 'AWS', logo: 'aws-svgrepo-com.svg' },
  { name: 'PostgreSQL', logo: 'postgresql-logo-svgrepo-com.svg' },
  { name: 'DynamoDB', logo: 'aws-dynamodb-svgrepo-com.svg' },
  { name: 'Lambda', logo: 'aws-lambda-svgrepo-com.svg' },
]
</script>

<style scoped>
.icon {
  width: 84px;
  height: 84px;
}

@media (max-width: 600px) {
  .icon {
    width: 64px;
    height: 64px;
  }
}
</style>
