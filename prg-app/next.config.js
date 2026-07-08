/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint isn't configured as a project dependency (kept the dependency
  // list minimal since installs can't be tested ahead of time in this
  // repo's authoring environment) — skip the lint step during `next build`
  // so a missing eslint config doesn't fail production builds. TypeScript
  // type-checking still runs and will fail the build on real type errors.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
