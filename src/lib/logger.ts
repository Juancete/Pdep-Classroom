import pino from "pino";

// En dev usamos `pino-pretty` (legible en la terminal). En prod no podemos
// usar transports: Vercel corre en serverless y los transports spawnean un
// worker thread que no sobrevive. Solo escupimos JSON a stdout y la
// plataforma lo captura. En test tampoco queremos pretty-print (los tests
// mockean el logger y no necesitan spawnear un worker).
const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // `redact` enmascara campos sensibles aunque alguien los pase por accidente
  // en el context del log. Ante la duda, agregar acá antes de logguear el valor.
  redact: {
    paths: [
      "email",
      "*.email",
      "password",
      "*.password",
      "token",
      "*.token",
      "authorization",
      "*.authorization",
      "cookie",
      "*.cookie",
      "x-hub-signature-256",
      "*.x-hub-signature-256",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l" },
    },
  }),
});
