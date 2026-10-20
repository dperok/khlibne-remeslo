"use client";

import { useState } from "react";
import Link from "next/link";

export default function DatabaseCheck() {
  const [result, setResult] = useState("Ready to check Postgres.");
  const [pending, setPending] = useState(false);

  async function checkDatabase() {
    setPending(true);
    setResult("Checking…");
    try {
      const probe = crypto.randomUUID();
      const response = await fetch(`/api/database?probe=${probe}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Database check failed");
      if (data.probe !== probe) throw new Error("Database response did not match the request");
      setResult(`Postgres connected. Database time: ${data.checkedAt}. Probe: ${data.probe}`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Database check failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: "80px auto", padding: 24 }}>
      <h1>Database connection</h1>
      <p style={{ margin: "24px 0" }}>Check the app’s connection to Neon Postgres.</p>
      <button onClick={checkDatabase} disabled={pending} style={{ padding: "12px 20px", cursor: "pointer" }}>
        {pending ? "Checking…" : "Check database"}
      </button>
      <p role="status" style={{ marginTop: 24, overflowWrap: "anywhere" }}>{result}</p>
      <p style={{ marginTop: 24 }}><Link href="/">Back to home</Link></p>
    </main>
  );
}
