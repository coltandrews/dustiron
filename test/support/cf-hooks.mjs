// Lets tests import the Cloudflare Worker: `cloudflare:workers` becomes a tiny stand-in.
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', shortCircuit: true };
  return next(specifier, context);
}
