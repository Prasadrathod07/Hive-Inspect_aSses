// Vitest runs outside Next.js's webpack pipeline, which is what normally
// makes the real `server-only` package's client-import guard work (it
// relies on bundler-specific module resolution, not a Node-runtime check).
// vitest.config.mts aliases "server-only" to this no-op stub so tests can
// import server-side modules directly. The real guard still applies in
// actual Next.js builds — this only affects the test runner.
export {};
