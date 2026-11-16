import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolve host SDKs from the selected DSH installation, including Electron ASAR.
export async function importRuntime(ctx, name) {
  const anchor = ctx.get('profileContext')?.installAnchor;
  if (anchor) return import(pathToFileURL(createRequire(anchor).resolve(name)).href);
  const loader = ctx.get('loader');
  if (typeof loader?.import === 'function') return loader.import(name);
  return import(name);
}
