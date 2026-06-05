const requiredOrigin = 'https://cunabit.vercel.app';
const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const origin = process.env.CUNABIT_ALLOWED_ORIGIN || requiredOrigin;

const problems = [];

if (origin !== requiredOrigin) {
  problems.push(`CUNABIT_ALLOWED_ORIGIN should be ${requiredOrigin} for production.`);
}

if (!hasKv && !hasUpstash) {
  problems.push('Missing Redis/KV REST variables: set KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.');
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log('Production config looks ready.');
