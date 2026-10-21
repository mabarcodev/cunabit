import { registerHooks } from 'node:module';

const stubUrl = new URL('./cloudflare-workers-stub.mjs', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: stubUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  }
});
