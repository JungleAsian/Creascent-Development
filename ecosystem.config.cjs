// PM2 process definitions for the Docmee production VPS.
//
// Used by `pnpm tool deploy vps` (pm2 startOrReload ecosystem.config.cjs).
// Apps are resolved relative to this file's directory (VPS_DEPLOY_PATH), and
// must be built first — the deploy pipeline runs `pnpm ... build` before reload.
//
// Ports: api API_PORT=3001 (health at /health), inboxos PORT=3000. Override per
// app via the VPS environment or .env.production as needed.
module.exports = {
  apps: [
    {
      name: 'docmee-api',
      cwd: './apps/api',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'docmee-workers',
      cwd: './apps/workers',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'docmee-inboxos',
      cwd: './apps/inboxos',
      // Run Next.js production server directly with node (most reliable under PM2).
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production', PORT: '3000' }
    }
  ]
}
