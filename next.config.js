/** @type {import('next').NextConfig} */
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');
const webpack = require('webpack');

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
      
      // Copy Cesium assets to static directory
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: 'node_modules/cesium/Build/CesiumUnminified/Workers',
              to: 'static/cesium/Workers',
            },
            {
              from: 'node_modules/cesium/Build/CesiumUnminified/ThirdParty',
              to: 'static/cesium/ThirdParty',
            },
            {
              from: 'node_modules/cesium/Build/CesiumUnminified/Assets',
              to: 'static/cesium/Assets',
            },
            {
              from: 'node_modules/cesium/Build/CesiumUnminified/Widgets',
              to: 'static/cesium/Widgets',
            },
          ],
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
