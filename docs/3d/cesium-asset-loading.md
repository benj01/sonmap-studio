# Cesium Asset Loading Guide

This document provides guidance on how to fix issues with Cesium asset loading in the application.

## Common Issues

The most common issue with Cesium integration is missing asset files. Cesium requires various assets (Workers, ThirdParty libraries, Assets, and Widgets) to function properly. These assets need to be available at the correct path in your application.

## Error Symptoms

If you're experiencing any of the following issues, it's likely related to missing Cesium assets:

- 3D view shows a black screen
- Console errors showing 404 (Not Found) for Cesium assets
- Error messages about missing Workers or other Cesium components
- Debug panel in the application showing "Cesium assets not found" warnings

## Solution Options

### Option 1: Run the Build Process

The application is configured to copy Cesium assets during the build process. Simply running the build command should copy the necessary files:

```bash
npm run build
# or
yarn build
```

This will copy the Cesium assets to the `/static/cesium/` directory as part of the webpack build process.

### Option 2: Use the Manual Copy Script

If the build process doesn't work or you want to copy the assets without running a full build, you can use the provided script:

```bash
npm run copy-cesium-assets
# or
yarn copy-cesium-assets
```

This script will copy the Cesium assets to both `/static/cesium/` and `/cesium/` directories in the public folder.

### Option 3: Manual Copy

If the above options don't work, you can manually copy the assets:

1. Locate the Cesium package in your node_modules:
   ```
   node_modules/cesium/Build/Cesium/
   ```

2. Copy the following directories to your public/static/cesium/ directory:
   - Workers/
   - ThirdParty/
   - Assets/
   - Widgets/

## Verifying the Fix

After applying one of the solutions above, you can verify that the assets are correctly loaded by:

1. Checking the browser console for 404 errors (there should be none related to Cesium)
2. Looking at the debug panel in the 3D view, which should show "Cesium assets are accessible!"
3. Confirming that the 3D view renders correctly

## Configuration

The application is configured to look for Cesium assets at `/static/cesium/` by default. This is set in two places:

1. In the webpack configuration (next.config.js):
   ```javascript
   new webpack.DefinePlugin({
     CESIUM_BASE_URL: JSON.stringify('/static/cesium')
   })
   ```

2. In the CesiumView component:
   ```javascript
   window.CESIUM_BASE_URL = '/static/cesium/';
   ```

If you need to change this path, make sure to update it in both locations.

## Troubleshooting

If you're still experiencing issues after following the steps above:

1. Check that the assets are actually present in the correct location by inspecting the `/public/static/cesium/` directory
2. Verify that your web server is correctly serving static files from the public directory
3. Try clearing your browser cache and reloading the application
4. Check the browser console for any CORS-related errors that might prevent loading the assets

For further assistance, please contact the development team. 