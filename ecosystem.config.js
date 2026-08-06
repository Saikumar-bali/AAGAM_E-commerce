const nodeInterpreter = process.env.AAGAM_NODE_INTERPRETER || process.execPath;
const npmScript = process.env.AAGAM_NPM_CLI || "npm";

module.exports = {
  apps: [
    {
      name: "admin-dashboard",
      cwd: "./apps/admin-dashboard",
      script: npmScript,
      args: "start",
      interpreter: nodeInterpreter,
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    },
    {
      name: "api-gateway",
      cwd: "./apps/api-gateway",
      script: "dist/src/main.js",
      interpreter: nodeInterpreter,
      env: {
        NODE_ENV: "production",
        PORT: 3005,
        DEPLOY_SHA: process.env.DEPLOY_SHA || "unknown"
      }
    },
    {
      name: "worker-service",
      cwd: "./apps/worker-service",
      script: "dist/index.js",
      interpreter: nodeInterpreter,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
