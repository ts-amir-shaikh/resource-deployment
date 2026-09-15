/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit .next/standalone (a self-contained server with only the traced
  // node_modules) so the Docker image carries the app, not the toolchain.
  output: 'standalone',
  experimental: {
    // libsql loads its native binding with a dynamic require
    // (`@libsql/<platform>-<arch>`), which file tracing cannot follow, so the
    // standalone server would start and then crash on its first query.
    // Include every binding that npm installed for the build platform.
    outputFileTracingIncludes: {
      '/**': ['./node_modules/@libsql/**/*', './node_modules/libsql/**/*'],
    },
  },
};

export default nextConfig;
