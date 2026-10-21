// Sustituto mínimo de `cloudflare:workers` para ejecutar src/worker.mjs con node --test.
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
