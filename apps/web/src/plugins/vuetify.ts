import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

import { createVuetify } from 'vuetify';

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'aero',
    themes: {
      aero: {
        dark: false,
        colors: {
          primary: '#1F3A5F',
          secondary: '#8B1E3F',
          accent: '#C9A227',
          surface: '#FFFFFF',
          background: '#F4F6F8',
        },
      },
    },
  },
});
