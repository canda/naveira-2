const merge = require('webpack-merge');

const common = require('./webpack.config.common.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    host: '0.0.0.0',
    disableHostCheck: true
  }
});
