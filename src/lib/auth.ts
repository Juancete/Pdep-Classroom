import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { onSignIn } from "./auth.events";

// Los `events` viven en `auth.events.ts` (no en `auth.config.ts`) porque
// importan servicios que tocan MikroORM. El middleware instancia NextAuth
// con `authConfig` directamente y corre en edge runtime — separar los
// eventos garantiza que ese grafo de imports no se acople al bundle del
// middleware.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  events: {
    signIn: ({ profile }) => onSignIn(profile),
  },
});
