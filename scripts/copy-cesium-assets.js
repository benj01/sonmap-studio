/**
 * Script to manually copy Cesium assets to the public directory
 * Run with: node scripts/copy-cesium-assets.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths
const cesiumPath = path.dirname(require.resolve('cesium'));
const publicPath = path.resolve(__dirname, '../public');
const staticCesiumPath = path.join(publicPath, 'static/cesium');
const altCesiumPath = path.join(publicPath, 'cesium');

console.log('Copying Cesium assets to public directories...');

// Create directories if they don't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

ensureDirectoryExists(staticCesiumPath);
ensureDirectoryExists(altCesiumPath);

// Define source and destination paths
const copyPaths = [
  {
    from: path.join(cesiumPath, 'Build/Cesium/Workers'),
    to: [
      path.join(staticCesiumPath, 'Workers'),
      path.join(altCesiumPath, 'Workers')
    ]
  },
  {
    from: path.join(cesiumPath, 'Build/Cesium/ThirdParty'),
    to: [
      path.join(staticCesiumPath, 'ThirdParty'),
      path.join(altCesiumPath, 'ThirdParty')
    ]
  },
  {
    from: path.join(cesiumPath, 'Build/Cesium/Assets'),
    to: [
      path.join(staticCesiumPath, 'Assets'),
      path.join(altCesiumPath, 'Assets')
    ]
  },
  {
    from: path.join(cesiumPath, 'Build/Cesium/Widgets'),
    to: [
      path.join(staticCesiumPath, 'Widgets'),
      path.join(altCesiumPath, 'Widgets')
    ]
  }
];

// Check if Source/Assets exists and add it to the copy paths
const sourceAssetsPath = path.join(cesiumPath, 'Source/Assets');
if (fs.existsSync(sourceAssetsPath)) {
  copyPaths.push({
    from: sourceAssetsPath,
    to: [
      path.join(staticCesiumPath, 'Assets'),
      path.join(altCesiumPath, 'Assets')
    ]
  });
}

// Copy files using platform-specific commands
function copyDirectory(from, to) {
  if (!fs.existsSync(from)) {
    console.error(`Source directory does not exist: ${from}`);
    return;
  }
  
  ensureDirectoryExists(path.dirname(to));
  
  try {
    // Use different commands based on platform
    if (process.platform === 'win32') {
      // Windows
      execSync(`xcopy "${from}" "${to}" /E /I /Y`);
    } else {
      // Unix-like (Linux, macOS)
      execSync(`cp -R "${from}/"* "${to}/"`);
    }
    console.log(`Copied: ${from} -> ${to}`);
  } catch (error) {
    console.error(`Error copying ${from} to ${to}:`, error.message);
  }
}

// Execute the copy operations
copyPaths.forEach(({ from, to }) => {
  if (fs.existsSync(from)) {
    to.forEach(dest => {
      copyDirectory(from, dest);
    });
  } else {
    console.error(`Source path does not exist: ${from}`);
  }
});

console.log('Cesium assets copy completed!');
console.log('Assets should now be available at:');
console.log(`- /static/cesium/`);
console.log(`- /cesium/`); 