// The loader hook css.mjs registers: any .css import is an empty module, and a Vite asset URL import
// (`model.glb?url`) is its file's URL (flrnoh fork: for tests that build client meshes, coaster.test.ts).
export async function load(url, context, next) {
  const u = new URL(url);
  if (u.pathname.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  if (u.search === '?url') return { format: 'module', source: `export default ${JSON.stringify(u.pathname)};`, shortCircuit: true };
  return next(url, context);
}
