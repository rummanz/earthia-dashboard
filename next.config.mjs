/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native/optional native modules out of the webpack bundle so they load
  // via Node's require at runtime (avoids `bufferUtil.mask is not a function`
  // and `better-sqlite3` native binding errors).
  serverExternalPackages: ['ws', 'better-sqlite3', 'bufferutil', 'utf-8-validate'],
  experimental: {
    serverComponentsExternalPackages: [
      'ws',
      'better-sqlite3',
      'bufferutil',
      'utf-8-validate',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals || []
      const list = Array.isArray(externals) ? externals : [externals]
      list.push({
        ws: 'commonjs ws',
        bufferutil: 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
        'better-sqlite3': 'commonjs better-sqlite3',
      })
      config.externals = list
    }
    return config
  },
}

export default nextConfig
