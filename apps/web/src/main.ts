import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';

import App from './App.vue';
import { vuetify } from './plugins/vuetify';
import { router } from './router';

createApp(App).use(router).use(vuetify).use(VueQueryPlugin).mount('#app');
