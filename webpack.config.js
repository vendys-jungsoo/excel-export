const path = require("path");
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./src/xlsx_export.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    library: "handleFileExport", // 전역 스코프에서 사용할 이름
    libraryTarget: "umd", // UMD 형식으로 번들링
    globalObject: "this", // 전역 객체 설정
  },
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    modules: [
      path.resolve(__dirname, "./src"),
      path.resolve(__dirname, "./node_modules"),
    ],
  },
  cache: {
    type: "filesystem",
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/i,
        exclude: /node_modules/,
        loader: "babel-loader",
        options: {
          cacheCompression: false,
          cacheDirectory: true,
          presets: ["@babel/preset-env"],
        },
      },
    ],
  },
  optimization: {
    minimizer: [new UglifyJsPlugin()],
  },
};
