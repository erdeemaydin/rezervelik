module.exports = {
  apps: [
    {
      name: 'dining-api',
      cwd: '/home/deploy/dining-reservation',
      script: 'dist/server.js',
      exec_mode: 'fork',            // fork (NOT cluster) — the price-updater worker runs in-process; never run >1
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'dining-web',
      cwd: '/home/deploy/dining-reservation/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production' },
    },
  ],
};