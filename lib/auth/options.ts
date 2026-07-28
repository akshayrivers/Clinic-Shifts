import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyUserCredentials, AuthenticationError } from "@/lib/auth/service";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@clinic.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter your email and password.");
        }

        try {
          const user = await verifyUserCredentials(credentials.email, credentials.password);
          return {
            id: user.id,
            email: user.email,
            name: user.fullName,
            fullName: user.fullName,
            role: user.role,
            profession: user.profession,
          };
        } catch (error) {
          if (error instanceof AuthenticationError) {
            throw new Error(error.message);
          }
          console.error("Auth authorization error:", error);
          throw new Error("An unexpected error occurred during authentication.");
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.fullName = user.fullName;
        token.role = user.role;
        token.profession = user.profession;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.fullName = token.fullName;
        session.user.role = token.role;
        session.user.profession = token.profession;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "clinic-shift-scheduler-secret-key-development",
};
