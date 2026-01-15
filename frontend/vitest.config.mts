// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - Export exists in package.json but TS resolution might miss it
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, '.')
    }
  },
  optimizeDeps: {
    include: ['zustand']
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'types/proto/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.setup.*',
        '**/stories/**',
        '.next/**',
        'dist/**',
        '**/*.shims.d.ts'
      ]
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx', 'components/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    exclude: ['node_modules/**/*'],
    projects: [
      // Unit tests project
      {
        plugins: [tsconfigPaths(), react()],
        resolve: {
          alias: {
            '@': path.resolve(dirname, '.')
          }
        },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
          exclude: ['stories/**/*', 'node_modules/**/*']
        }
      },
      // Storybook tests project
      {
        plugins: [
          tsconfigPaths(),
          react(),
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook')
          })
        ],
        resolve: {
          alias: {
            '@': path.resolve(dirname, '.')
          }
        },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{
              browser: 'chromium'
            }]
          },
          setupFiles: ['.storybook/vitest.setup.ts']
        }
      }
    ]
  }
});