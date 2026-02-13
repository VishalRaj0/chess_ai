/* eslint-disable no-param-reassign */
// Suppress broken source map warning from chess.js (missing chess.ts in package)
module.exports = {
  webpack: {
    configure: (config) => {
      const rule = config.module.rules.find(
        (r) => r.enforce === 'pre' && r.use?.some?.((u) => u?.loader?.includes?.('source-map-loader'))
      );
      if (rule) {
        rule.exclude = /node_modules\/chess\.js/;
      }
      return config;
    },
  },
};
