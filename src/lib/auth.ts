import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { PdepUser } from "@/types";

const adminUsernames = (process.env.ADMIN_GITHUB_USERNAMES ?? "")
  .split(",")
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // Pedimos scope de lectura para saber el username
      authorization: { params: { scope: "read:user" } },
    }),
  ],

  callbacks: {
    async jwt({ token, profile }) {
      // En el primer login, guardamos el username de GitHub
      if (profile) {
        token.githubUsername = (profile as { login?: string }).login ?? "";
      }
      return token;
    },

    async session({ session, token }) {
      const ghUser = (token.githubUsername as string) ?? "";
      const pdepUser: PdepUser = {
        githubUsername: ghUser,
        name: session.user?.name ?? ghUser,
        image: session.user?.image ?? "",
        isAdmin: adminUsernames.includes(ghUser.toLowerCase()),
      };
      // Inyectamos en la session
      (session as unknown as { pdepUser: PdepUser }).pdepUser = pdepUser;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});
