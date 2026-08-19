import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import type { SessionPdepUser } from "@/types";
import { resolverRol, DOCENTE } from "@/domain/entities/RolDeUsuario";

const adminUsernames = (process.env.ADMIN_GITHUB_USERNAMES ?? "")
  .split(",")
  .map((username) => username.trim().toLowerCase())
  .filter(Boolean);

// Sólo en desarrollo Y con opt-in explícito: entrar tipeando cualquier
// githubUsername, sin pasar por el OAuth real de GitHub. Dos condiciones
// independientes en vez de una — NODE_ENV=development solo no alcanza como
// gate de un bypass de auth: alguna plataforma de hosting mal configurada
// podría dejarlo filtrar a producción sin que nadie lo pida a propósito.
// Registrado condicionalmente — si cualquiera de las dos falta, el provider
// ni siquiera existe, así que NextAuth rechaza cualquier intento de
// loguearse por acá aunque alguien adivine el nombre del provider.
const devLoginProvider =
  process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_LOGIN === "true"
    ? Credentials({
        id: "dev-login",
        name: "Modo desarrollo",
        credentials: {
          githubUsername: { label: "GitHub username", type: "text" },
        },
        async authorize(credentials) {
          const githubUsername = String(credentials?.githubUsername ?? "").trim();
          if (!githubUsername) return null;
          return { id: githubUsername, name: githubUsername };
        },
      })
    : null;

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user" } },
    }),
    ...(devLoginProvider ? [devLoginProvider] : []),
  ],

  callbacks: {
    async jwt({ token, profile, user, account }) {
      if (profile) {
        token.githubUsername = (profile as { login?: string }).login ?? "";
      } else if (account?.provider === "dev-login" && user?.id) {
        token.githubUsername = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      const ghUser = (token.githubUsername as string) ?? "";
      // rolNombre, no la instancia de RolDeUsuario: Auth.js clona este
      // objeto internamente antes de devolverlo desde auth(), y el clon no
      // preserva el prototype de una clase (ver el comentario de
      // NombreRolDeUsuario). Los consumidores reconstruyen el rol real con
      // rolDesdeNombre(...) — getCurrentUser() y getProxyRedirectPath().
      const pdepUser: SessionPdepUser = {
        githubUsername: ghUser,
        name: session.user?.name ?? ghUser,
        image: session.user?.image ?? "",
        rolNombre: resolverRol(ghUser, adminUsernames) === DOCENTE ? "docente" : "alumno",
      };
      (session as unknown as { pdepUser: SessionPdepUser }).pdepUser = pdepUser;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
};
