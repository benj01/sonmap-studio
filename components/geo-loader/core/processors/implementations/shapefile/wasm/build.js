const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Building WebAssembly module...');
  
  const wasmPath = path.resolve(__dirname);
  
  // Build using wasm-pack CLI
  execSync('wasm-pack build --target web --out-dir pkg', {
    cwd: wasmPath,
    stdio: 'inherit'
  });

  console.log('WebAssembly build complete!');
} catch (error) {
  console.error('WebAssembly build failed:', error);
  process.exit(1);
}
