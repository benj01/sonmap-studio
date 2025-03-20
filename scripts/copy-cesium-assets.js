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
const cesiumAssetsPath = path.join(publicPath, 'static/cesium');

console.log('Copying Cesium assets to public directory...');

// Create directory if it doesn't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

ensureDirectoryExists(cesiumAssetsPath);

// Define source and destination paths
const copyPaths = [
  {
    from: path.join(cesiumPath, 'Build/Cesium/Workers'),
    to: path.join(cesiumAssetsPath, 'Workers')
  },
  {
    from: path.join(cesiumPath, 'Build/Cesium/ThirdParty'),
    to: path.join(cesiumAssetsPath, 'ThirdParty')
  },
  {
    from: path.join(cesiumPath, 'Build/Cesium/Assets'),
    to: path.join(cesiumAssetsPath, 'Assets')
  },
  {
    from: path.join(cesiumPath, 'Build/Cesium/Widgets'),
    to: path.join(cesiumAssetsPath, 'Widgets')
  },
  // Add NaturalEarthII assets
  {
    from: path.join(cesiumPath, 'Source/Assets/Textures/NaturalEarthII'),
    to: path.join(cesiumAssetsPath, 'Assets/Textures/NaturalEarthII')
  }
];

// Check if Source/Assets exists and add it to the copy paths
const sourceAssetsPath = path.join(cesiumPath, 'Source/Assets');
if (fs.existsSync(sourceAssetsPath)) {
  copyPaths.push({
    from: sourceAssetsPath,
    to: path.join(cesiumAssetsPath, 'Assets')
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
    copyDirectory(from, to);
  } else {
    console.error(`Source path does not exist: ${from}`);
  }
});

console.log('Cesium assets copy completed!');
console.log('Assets are now available at:');
console.log(`- /static/cesium/`);

// Verify NaturalEarthII assets
const naturalEarthIIPath = path.join(cesiumAssetsPath, 'Assets/Textures/NaturalEarthII');
if (fs.existsSync(naturalEarthIIPath)) {
  console.log('NaturalEarthII assets successfully copied!');
} else {
  console.error('Warning: NaturalEarthII assets not found. You may need to manually copy them from the Cesium source.');
} 