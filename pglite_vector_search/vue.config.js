const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  outputDir: '../docs',
  assetsDir: 'assets',
  publicPath: '/PGLiteVectorSearch/',
  configureWebpack: {
    devtool: "source-map"
  }
})
