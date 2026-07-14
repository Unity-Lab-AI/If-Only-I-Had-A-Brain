// Empty stub — aliased over Node builtins (fs/path/crypto) that the vendored
// Emscripten phonemizer references ONLY inside ENVIRONMENT_IS_NODE-guarded dead
// branches. In the browser worker these are never executed; the stub just lets
// esbuild resolve the static require() without pulling in Node polyfills.
module.exports = {};
