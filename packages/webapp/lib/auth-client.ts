import { createAuthClient } from "better-auth/react";

// Same-origin Next.js app — no baseURL needed; the client hits
// /api/auth/* on whatever host the page was served from.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
