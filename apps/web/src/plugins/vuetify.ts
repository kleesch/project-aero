import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

import { createVuetify } from 'vuetify';

// Two themes sharing the same brand palette. `aero` is the light default;
// `aeroDark` lifts the interactive colors for contrast on dark surfaces. The
// active theme is chosen in App.vue (persisted to localStorage, falling back
// to the OS `prefers-color-scheme`).
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
      aeroDark: {
        dark: true,
        colors: {
          // Lightened brand tones so links/buttons stay legible on dark.
          primary: '#5B8AC5',
          secondary: '#D14D6B',
          accent: '#D4B24A',
          surface: '#1B2129',
          background: '#12161C',
        },
      },
    },
  },
});
