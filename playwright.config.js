import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4178';
const systemChromium = '/usr/bin/chromium';
const fallbackChromium = !existsSync(chromium.executablePath()) && existsSync(systemChromium)
  ? systemChromium
  : undefined;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || fallbackChromium;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
    url: baseURL,
  },
});
