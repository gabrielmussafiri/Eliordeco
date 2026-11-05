"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Wordmark } from "@/components/ui/Wordmark";
import { ApiError } from "@/lib/api";
import { post } from "@/lib/admin";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await post("/api/admin/login", { email, password });
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Wait a few minutes and try again."
        : err instanceof ApiError && err.status === 401 ? "That email and password don't match."
        : "We couldn't sign you in right now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden bg-espresso p-12 text-ivory lg:flex lg:flex-col lg:justify-between">
        <Wordmark className="text-ivory" />
        <p className="display max-w-md text-5xl italic leading-tight text-cream">The studio behind every gathering.</p>
      </div>
      <div className="flex items-center px-6 py-16 sm:px-16">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Wordmark /></div>
          <p className="eyebrow">Staff only</p>
          <h1 className="display mt-3 text-5xl">Sign in</h1>
          <div className="mt-10 space-y-8">
            <Field id="email" label="Email" type="email" autoComplete="username" value={email} required onChange={(e) => setEmail(e.target.value)} />
            <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="mt-6 text-sm text-danger">{error}</p>}
          <Button type="submit" arrow className="mt-10 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
      </div>
    </main>
  );
}
