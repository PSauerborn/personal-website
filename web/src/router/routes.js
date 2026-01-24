const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/IndexPage.vue'),
        name: 'home',
      },
      {
        path: 'blog',
        component: () => import('pages/BlogPage.vue'),
        name: 'blog',
      },
      {
        path: 'blog/:slug',
        component: () => import('pages/BlogArticlePage.vue'),
        name: 'blog-article',
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
