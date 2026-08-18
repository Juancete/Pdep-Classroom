import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import type { PdepUser } from "@/types";
import { resolverRol } from "@/domain/entities/RolDeUsuario";

const adminUsernames = (process.env.ADMIN_GITHUB_USERNAMES ?? "")
  .split(",")
  .map((username) => username.trim().toLowerCase())
  .filter(Boolean);

// Sólo en desarrollo: entrar tipeando cualquier githubUsername, sin pasar por
// el OAuth real de GitHub. Registrado condicionalmente — en producción este
// provider ni siquiera existe, así que NextAuth rechaza cualquier intento de
// loguearse por acá aunque alguien adivine el nombre del provider.
const devLoginProvider =
  process.env.NODE_ENV === "development"
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
      const pdepUser: PdepUser = {
        githubUsername: ghUser,
        name: session.user?.name ?? ghUser,
        image: session.user?.image ?? "",
        rol: resolverRol(ghUser, adminUsernames),
      };
      (session as unknown as { pdepUser: PdepUser }).pdepUser = pdepUser;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
};
