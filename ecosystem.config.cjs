module.exports = {
  apps: [
    {
      name: 'core-api',
      cwd: '/opt/whoobe/whoobe_cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/core-api start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'asset-processor',
      cwd: '/opt/whoobe/whoobe_cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/asset-processor start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'admin-dashboard',
      cwd: '/opt/whoobe/whoobe_cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/admin-dashboard preview --host 0.0.0.0 --port 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'whoobe-one-spike',
      cwd: '/opt/whoobe/whoobe_cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/whoobe-one-spike preview --host 0.0.0.0 --port 3006',
      env: { NODE_ENV: 'production' },
    },
  ],
};