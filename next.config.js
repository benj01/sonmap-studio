/** @type {import('next').NextConfig} */
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle dxf-parser module in browser environment
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,  // dxf-parser might try to use fs module
        path: false // dxf-parser might try to use path module
      };

      // Define global Cesium variables
      config.plugins.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify('/static/cesium')
        })
      );
      
      // Get the Cesium path
      const cesiumPath = path.dirname(require.resolve('cesium'));
      
      // Define patterns for copying Cesium assets
      const patterns = [
        {
          from: path.join(cesiumPath, 'Build/Cesium/Workers'),
          to: 'static/cesium/Workers',
        },
        {
          from: path.join(cesiumPath, 'Build/Cesium/ThirdParty'),
          to: 'static/cesium/ThirdParty',
        },
        {
          from: path.join(cesiumPath, 'Build/Cesium/Assets'),
          to: 'static/cesium/Assets',
        },
        {
          from: path.join(cesiumPath, 'Build/Cesium/Widgets'),
          to: 'static/cesium/Widgets',
        }
      ];
      
      // Only add Source/Assets if it exists
      const sourceAssetsPath = path.join(cesiumPath, 'Source/Assets');
      if (fs.existsSync(sourceAssetsPath)) {
        patterns.push({
          from: sourceAssetsPath,
          to: 'static/cesium/Assets',
          force: true,
        });
      }
      
      // Copy Cesium assets to static directory
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: patterns
        })
      );
    }

    // Enable WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true
    };

    // Ensure proper module loading
    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false
      }
    });

    // Configure WebAssembly loading for web target
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/wasm/[hash][ext]'
      }
    });

    // Add dxf-parser to the list of transpiled modules
    config.module.rules.push({
      test: /node_modules\/dxf-parser/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
          plugins: ['@babel/plugin-transform-runtime']
        }
      }
    });

    return config;
  }
};

module.exports = nextConfig;
