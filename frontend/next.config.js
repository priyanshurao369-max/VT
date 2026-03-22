/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "tesseract.js",
    "edge-tts",
    "ws",
    "@napi-rs/canvas",
  ],
};

module.exports = nextConfig;
