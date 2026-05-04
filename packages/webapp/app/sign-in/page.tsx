"use client"

import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-5">
      <h1 className="text-2xl font-semibold">Sign in to monmap</h1>
      <Button
        onClick={() =>
          signIn.social({ provider: "google", callbackURL: "/" })
        }
      >
        Continue with Google
      </Button>
    </main>
  )
}
