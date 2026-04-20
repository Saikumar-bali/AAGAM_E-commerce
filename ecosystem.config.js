module.exports = {
  apps: [
    {
      name: "admin-dashboard",
      cwd: "./apps/admin-dashboard",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    },
    {
      name: "api-gateway",
      cwd: "./apps/api-gateway",
      script: "dist/main.js",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    },
    {
      name: "worker-service",
      cwd: "./apps/worker-service",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
