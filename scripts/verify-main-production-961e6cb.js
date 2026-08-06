#!/usr/bin/env node

const https = require('https');

const repository = process.env.GITHUB_REPOSITORY || 'Saikumar-bali/AAGAM_E-commerce';
const targetSha = '961e6cbbbdeb284e89e72b065187aacf7e301c94';
const maxAttempts = 55;
const intervalMs = 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchRuns() {
  const path = `/repos/${repository}/actions/runs?head_sha=${targetSha}&per_page=100`;
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: 'api.github.com',
        path,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'AAGAM-exact-production-verifier',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `GitHub Actions API returned ${response.statusCode}; remaining=${response.headers['x-ratelimit-remaining'] || 'unknown'}: ${body.slice(0, 500)}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(body).workflow_runs || []);
          } catch (error) {
            reject(new Error(`Unable to parse GitHub Actions response: ${error.message}`));
          }
        });
      },
    );
    request.setTimeout(20_000, () => request.destroy(new Error('GitHub Actions API request timed out')));
    request.on('error', reject);
  });
}

function latestRun(runs, name, event) {
  return runs
    .filter((run) => run.name === name && run.event === event && run.head_sha === targetSha)
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at))
    .at(-1);
}

async function main() {
  let consecutiveApiErrors = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let runs;
    try {
      runs = await fetchRuns();
      consecutiveApiErrors = 0;
    } catch (error) {
      consecutiveApiErrors += 1;
      console.error(`[exact-deploy-verifier] API attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
      if (consecutiveApiErrors >= 5) process.exit(1);
      await sleep(intervalMs);
      continue;
    }

    const ci = latestRun(runs, 'CI', 'push');
    const deploy = latestRun(runs, 'Deploy production', 'workflow_run');

    console.log(
      `[exact-deploy-verifier] target=${targetSha} ` +
        `ci=${ci ? `${ci.id}:${ci.status}:${ci.conclusion || 'pending'}` : 'not-found'} ` +
        `deploy=${deploy ? `${deploy.id}:${deploy.status}:${deploy.conclusion || 'pending'}` : 'not-found'} ` +
        `attempt=${attempt}/${maxAttempts}`,
    );

    if (ci?.status === 'completed' && ci.conclusion !== 'success') {
      console.error(`[exact-deploy-verifier] Main CI failed: run=${ci.id}, conclusion=${ci.conclusion}`);
      process.exit(1);
    }

    if (deploy?.status === 'completed') {
      if (ci?.conclusion === 'success' && deploy.conclusion === 'success') {
        console.log(`[exact-deploy-verifier] VERIFIED ci_run=${ci.id} deploy_run=${deploy.id}`);
        process.exit(0);
      }
      console.error(
        `[exact-deploy-verifier] Production deploy failed: ci_run=${ci?.id || 'not-found'} ` +
          `ci=${ci?.conclusion || 'not-completed'} deploy_run=${deploy.id} deploy=${deploy.conclusion}`,
      );
      process.exit(1);
    }

    await sleep(intervalMs);
  }

  console.error(`[exact-deploy-verifier] Timed out waiting for exact main CI/deployment for ${targetSha}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`[exact-deploy-verifier] Fatal error: ${error.stack || error.message}`);
  process.exit(1);
});
