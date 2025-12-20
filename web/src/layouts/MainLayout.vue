<template>
  <q-layout view="lHh Lpr lFf">
    <q-header style="background-color: #f6f2ea" class="q-pa-md">
      <page-header></page-header>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import PageHeader from 'src/components/PageHeader.vue'
</script>
