const { build } = require("@wasm-tool/wasm-pack-plugin");
const path = require("path");

async function buildWasm() {
  try {
    console.log("Building WebAssembly module...");
    
    const wasmPath = path.resolve(__dirname);
    
    await build({
      path: wasmPath,
      target: "web",
      release: true,
      outDir: "pkg",
      outName: "shapefile_wasm",
      extraArgs: "--no-typescript", // We'll create our own TypeScript types
    });

    console.log("WebAssembly build complete!");
  } catch (error) {
    console.error("WebAssembly build failed:", error);
    process.exit(1);
  }
}

buildWasm();
