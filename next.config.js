/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle dxf-parser module in browser environment
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,  // dxf-parser might try to use fs module
        path: false // dxf-parser might try to use path module
      };
    }

    // Ensure proper module loading
    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false
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
  },
  
  // Enable experimental features for better module support
  experimental: {
    esmExternals: 'loose'
  }
};

module.exports = nextConfig;
