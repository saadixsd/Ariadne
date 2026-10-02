import { AuthForm } from "@/components/AuthForm";

// Static: built once at deploy, so the door costs the Worker almost no CPU. A visitor
// who already holds a session cookie is rewritten by proxy.ts to ./session, which
// checks the session and sends a signed-in, verified account to the board as before.
export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
