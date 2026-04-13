/** @type {import('next').NextConfig} */
const nextConfig = {
  // MikroORM usa ts-morph para leer metadata de entidades desde el filesystem.
  // Si corre dentro de webpack (RSC), los paths se transforman a webpack-internal://
  // y ts-morph no puede resolver los archivos. Externalizar hace que corra en Node.js puro.
  serverExternalPackages: [
    "@mikro-orm/core",
    "@mikro-orm/postgresql",
    "@mikro-orm/reflection",
    "@mikro-orm/migrations",
  ],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },

  webpack: (config) => {
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
