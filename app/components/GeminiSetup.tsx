"use client";

import KeySetup, { type KeyStatus } from "@/app/components/KeySetup";
import { api, useApi } from "@/lib/client";

const ext = (href: string, label: string) => <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>;

/** Admin page: the Gemini key that reads parts off screenshots and receipts, with a step-by-step guide. */
export default function GeminiSetup() {
  const { data, reload } = useApi<{ gemini: KeyStatus }>("/api/admin/integrations");
  return (
    <KeySetup
      title="Read screenshots and receipts (Gemini)"
      description={<>
        Adds <b>Read a screenshot</b> to the part forms: a screenshot of a product page or an order, or a photo of a receipt, fills in the parts and prices.
        Google&apos;s Gemini API has a free tier, so this costs nothing. On the free tier Google may use what you send to improve its products,
        so crop out anything you wouldn&apos;t want Google to see. NitroLog doesn&apos;t keep the pictures.
      </>}
      guideTitle="How to get a free Gemini key (about 2 minutes)"
      status={data?.gemini}
      fields={[{ id: "apiKey", label: "Gemini API key", placeholder: "Starts with AQ. or AIza…" }]}
      steps={[
        <>Go to {ext("https://aistudio.google.com/apikey", "aistudio.google.com/apikey")} and sign in with any Google account. Accept the terms if it asks.</>,
        <>Click <b>Create API key</b>. If it asks for a project, let it make a new one. You don&apos;t need a card, and you shouldn&apos;t add one: without billing, the key stays on the free tier and can never be charged.</>,
        <>Copy the key. It&apos;s a long line of letters and numbers that starts with <b>AQ.</b> (or <b>AIza</b> on older keys). Copy all of it.</>,
        <>Paste it below and tap <b>Save</b>, then <b>Test</b>.</>,
        <>On a service record or the Parts page, tap <b>Read a screenshot</b> under the link box and pick a picture.</>,
      ]}
      onSave={async v => {
        await api("/api/admin/integrations", { method: "PUT", body: { gemini: v ? { apiKey: v.apiKey } : null } });
        await reload();
      }}
      onTest={async () => (await api<{ message: string }>("/api/admin/integrations/test?service=gemini", { method: "POST" })).message}
    />
  );
}
