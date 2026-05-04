import { GoogleSignInButton } from "@/components/google-sign-in-button"

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in to monmap</h1>
        <p className="text-sm text-muted-foreground">
          Save your plan to your account so it follows you across devices.
        </p>
      </div>
      <GoogleSignInButton callbackURL="/" />
    </main>
  )
}
