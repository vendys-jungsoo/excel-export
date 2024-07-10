const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "excel.min.js",
    library: "handleFileExport", // 전역 스코프에서 사용할 이름
    libraryTarget: "umd", // UMD 형식으로 번들링
    libraryExport: "default", // 기본 내보내기 설정
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
    minimize: true,
    minimizer: [
      new TerserPlugin({
        test: /\.(js|jsx|ts|tsx)$/,
        terserOptions: {
          format: {
            comments: false, // 빌드 시, comment 제거 (주석 제거)
          },
          compress: {
            drop_console: true, // 빌드 시, console.* 구문 코드 제거
          },
        },
        extractComments: false, // 주석을 별도의 파일로 추출할 지 여부
      }),
    ],
  },
};
