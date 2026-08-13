import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { onSignIn } from "./auth.events";

// Los `events` viven en `auth.events.ts` (no en `auth.config.ts`) porque
// importan servicios que tocan MikroORM. El proxy instancia NextAuth con
// `authConfig` directamente; separar los eventos evita acoplar ese grafo de
// imports al límite de red y mantiene liviana la validación de cada request.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  events: {
    signIn: ({ profile }) => onSignIn(profile),
  },
});
