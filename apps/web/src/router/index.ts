import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/bills', name: 'bills', component: () => import('../views/BillsView.vue') },
    {
      path: '/bills/:ref',
      name: 'bill-detail',
      component: () => import('../views/BillDetailView.vue'),
    },
    { path: '/courts', name: 'courts', component: () => import('../views/CourtsView.vue') },
    {
      path: '/businesses',
      name: 'businesses',
      component: () => import('../views/BusinessesView.vue'),
    },
    { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue') },
  ],
});
