"use client";

import KeySetup, { type KeyStatus } from "@/app/components/KeySetup";
import { api, useApi } from "@/lib/client";

const ext = (href: string, label: string) => <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>;

/** Admin page: the eBay keyset that turns on live part prices, with a step-by-step guide to getting one. */
export default function EbaySetup() {
  const { data, reload } = useApi<{ ebay: KeyStatus }>("/api/admin/integrations");
  return (
    <KeySetup
      title="Part prices (eBay)"
      description={<>Shows current eBay prices for a part on the service form, matched to the vehicle where eBay knows the fit. eBay&apos;s developer keys are free.</>}
      guideTitle="How to get free eBay keys (about 5 minutes)"
      status={data?.ebay}
      fields={[
        { id: "clientId", label: "App ID (Client ID)", placeholder: "e.g. YourName-NitroLog-PRD-1a2b3c4d5-6e7f8a9b" },
        { id: "clientSecret", label: "Cert ID (Client Secret)", placeholder: "e.g. PRD-1a2b3c4d5e6f-7a8b-9c0d-1e2f-3a4b" },
      ]}
      steps={[
        <>Go to {ext("https://developer.ebay.com/signin", "developer.ebay.com")} and sign in with your normal eBay account (or make one). Join the Developers Program when it asks. It&apos;s free, though approving a new developer account can take eBay up to a day.</>,
        <>Open {ext("https://developer.ebay.com/my/keys", "Application Keys")} from the menu under your name.</>,
        <>Type an application name, such as <b>NitroLog</b>, and click <b>Create a keyset</b> in the <b>Production</b> column. Not Sandbox: Sandbox keys only see fake test listings.</>,
        <>If eBay asks about <b>marketplace account deletion</b> notifications, choose the option to apply for an exemption because you don&apos;t store eBay user data. NitroLog only keeps prices for 30 minutes and never sees anyone&apos;s eBay account.</>,
        <>In the Production keyset, copy the <b>App ID (Client ID)</b> and the <b>Cert ID (Client Secret)</b> into the boxes below. You don&apos;t need the Dev ID.</>,
        <>Tap <b>Save</b>, then <b>Test</b>. On a service record, <b>Check prices</b> now shows eBay listings.</>,
      ]}
      onSave={async v => {
        await api("/api/admin/integrations", { method: "PUT", body: { ebay: v ? { clientId: v.clientId, clientSecret: v.clientSecret } : null } });
        await reload();
      }}
      onTest={async () => (await api<{ message: string }>("/api/admin/integrations/test", { method: "POST" })).message}
    />
  );
}
