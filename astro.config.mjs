// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  env: {
    schema: {
      PUBLIC_WIDGET_FRONTEND_ORIGIN: envField.string({
        context: 'client',
        access: 'public',
      }),
      PUBLIC_WIDGET_BACKEND_ORIGIN: envField.string({
        context: 'client',
        access: 'public',
      }),
      PUBLIC_WIDGET_MASTER_WS: envField.string({
        context: 'client',
        access: 'public',
      }),
      PUBLIC_WIDGET_MASTER_DATASET_WIDGET: envField.string({
        context: 'client',
        access: 'public',
      }),
      PUBLIC_WIDGET_MASTER_KM_WIDGET: envField.string({
        context: 'client',
        access: 'public',
      }),
      PUBLIC_WIDGET_MASTER_DATA_TABLE_WIDGET: envField.string({
        context: 'client',
        access: 'public',
      }),
      PUBLIC_DATA_FILES_ORIGIN: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_ACCESS_CODE: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [svelte()]
});
