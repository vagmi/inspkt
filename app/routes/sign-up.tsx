import { SignUp } from "@clerk/react-router";
import { Link } from "react-router";

export function meta() {
  return [{ title: "Start free — Mudhal" }];
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <Link
        to="/"
        className="font-heading text-xl font-semibold tracking-tight"
      >
        Mudhal<span className="text-stamp">*</span>
      </Link>
      <SignUp fallbackRedirectUrl="/app" signInFallbackRedirectUrl="/app" />
    </div>
  );
}
