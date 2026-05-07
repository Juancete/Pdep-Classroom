import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";
import type { PdepUser } from "@/types";

const adminUsernames = (process.env.ADMIN_GITHUB_USERNAMES ?? "")
  .split(",")
  .map((username) => username.trim().toLowerCase())
  .filter(Boolean);

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user" } },
    }),
  ],

  callbacks: {
    async jwt({ token, profile }) {
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
      (session as unknown as { pdepUser: PdepUser }).pdepUser = pdepUser;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
};
