# 📂 wasm

## Overview
This folder contains WebAssembly module configuration and build scripts for shapefile parsing and geometry calculations. The module is built using Rust and wasm-bindgen for seamless integration with JavaScript/TypeScript.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `Cargo.toml` | Rust package configuration file that defines the project metadata, dependencies, and build settings. Includes core dependencies like wasm-bindgen, serde for serialization, and optimization settings for release builds. |
| `Cargo.lock` | Auto-generated dependency lock file that ensures reproducible builds by tracking exact versions of all dependencies used in the project. |
| `build.js` | Node.js build script that automates the WebAssembly compilation process using wasm-pack, generating web-targeted output in the 'pkg' directory. |

## 🔗 Dependencies
- wasm-bindgen (0.2): Core WebAssembly bindings generation
- js-sys (0.3): JavaScript system interface bindings
- serde (1.0): Serialization/deserialization framework
- serde-wasm-bindgen (0.5): Serde integration with wasm-bindgen
- console_error_panic_hook (0.1): Better error handling in browser console
- wasm-bindgen-test (0.3): Testing framework for WebAssembly

## ⚙️ Usage Notes
- Build the WebAssembly module using `node build.js`
- The build process uses wasm-pack with the `--target web` flag
- Output is generated in the `pkg` directory
- Release builds are optimized with:
  - Maximum optimization level (opt-level = 3)
  - Link-time optimization enabled
  - Single codegen unit for size optimization

## 🔄 Related Folders/Modules
- pkg/: Output directory for compiled WebAssembly files
- src/: Rust source code for the WebAssembly module
- JavaScript/TypeScript modules that import the WebAssembly functions

## 🚧 TODOs / Planned Improvements
- Add source maps support for better debugging
- Implement WebAssembly streaming instantiation
- Add build configuration for different environments (dev/prod)
- Include compression settings for production builds
- Add detailed usage examples in documentation