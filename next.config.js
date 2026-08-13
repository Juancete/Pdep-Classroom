/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@mikro-orm/core",
    "@mikro-orm/postgresql",
    "@mikro-orm/migrations",
    "pino",
    "pino-pretty",
  ],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },

  webpack: (config, { isServer }) => {
    // MikroORM uses class names to register entities. In production,
    // the minifier renames all classes to single letters causing duplicates.
    // Disabling minimization on the server bundle fixes this.
    if (isServer) {
      config.optimization.minimize = false;
    }

    // Knex incluye drivers opcionales que no usamos. Sin esto Next.js
    // intenta resolver oracledb, mssql, sqlite3, etc. y falla.
    config.externals.push(
      "oracledb",
      "mssql",
      "mysql",
      "mysql2",
      "mariadb",
      "mariadb/callback",
      "sqlite3",
      "better-sqlite3",
      "pg-native",
      "tedious",
      "@vscode/sqlite3",
      "pg-query-stream"
    );
    return config;
  },
};

module.exports = nextConfig;
