"use client";

import { useState } from "react";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { post, useAction, useAdmin } from "@/lib/admin";

export default function Account() {
  const { me } = useAdmin();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [local, setLocal] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run, clear } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false); clear();
    if (next.length < 12) return setLocal("Use at least 12 characters.");
    if (next !== again) return setLocal("The two new passwords don't match.");
    setLocal("");
    const ok = await run(async () => { await post("/api/admin/password", { current_password: cur, new_password: next }); return true; });
    if (ok) { setDone(true); setCur(""); setNext(""); setAgain(""); }
  }

  return (
    <div>
      <PageHeader eyebrow="Your account" title="Account" />
      <p className="mt-6 text-sm text-ink-soft">Signed in as <strong className="text-espresso">{me.email}</strong> · {me.role}</p>
      <div className="mt-8 max-w-xl">
        <Panel title="Change password" id="pw">
          <form onSubmit={submit} className="space-y-7" noValidate>
            <Field id="cur" label="Current password" type="password" autoComplete="current-password" value={cur} required
              onChange={(e) => setCur(e.target.value)} />
            <Field id="new" label="New password" type="password" autoComplete="new-password" value={next} required
              hint="At least 12 characters. A few random words is stronger than a name and a year."
              onChange={(e) => setNext(e.target.value)} />
            <Field id="again" label="Repeat new password" type="password" autoComplete="new-password" value={again} required
              onChange={(e) => setAgain(e.target.value)} />
            {(local || error) && <p role="alert" className="text-sm text-danger">{local || error}</p>}
            {done && <p role="status" className="border-l-2 border-olive pl-4 text-sm">Password changed. Other devices have been signed out.</p>}
            <Button type="submit" arrow disabled={busy || !cur || !next || !again}>{busy ? "Saving…" : "Change password"}</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
