// Processes run from the directory this file is in, wherever deploy.sh put the repository.
const cwd = __dirname;

module.exports = {
  apps: [
    {
      name: 'core-api',
      cwd,
      script: 'pnpm',
      args: '--filter @whoobe-cms/core-api start',
      env: { NODE_ENV: 'production', LOG_LEVEL: 'info' },
    },
    {
      name: 'asset-processor',
      cwd,
      script: 'pnpm',
      args: '--filter @whoobe-cms/asset-processor start',
      env: { NODE_ENV: 'production', LOG_LEVEL: 'info', ASSET_PROCESSOR_URL: 'http://localhost:3002' },
    },
    {
      name: 'gateway',
      cwd,
      script: 'pnpm',
      args: '--filter @whoobe-cms/gateway start',
      env: { NODE_ENV: 'production', LOG_LEVEL: 'info' },
    },
    {
      name: 'admin-dashboard',
      cwd,
      script: 'pnpm',
      args: '--filter @whoobe-cms/admin-dashboard preview --host 0.0.0.0 --port 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'whoobe-one-spike',
      cwd,
      script: 'pnpm',
      args: '--filter @whoobe-cms/whoobe-one-spike preview --host 0.0.0.0 --port 3006',
      env: { NODE_ENV: 'production' },
    },
  ],
};