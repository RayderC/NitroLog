"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Runs on a store's product page, in the person's own browser, when they tap the bookmark. It reads the
 * page they're looking at (title, brand, part number, price) and opens NitroLog's service form with it.
 * Nothing is sent anywhere else, and NitroLog's server never visits the store.
 */
function bookmarkletCode(origin: string) {
  const js = `(function(){var O=${JSON.stringify(origin)};
function tx(e){return e?e.textContent.replace(/\\s+/g," ").trim():""}
function q(s){try{return tx(document.querySelector(s))}catch(e){return ""}}
var d={u:location.origin+location.pathname,s:location.hostname};
document.querySelectorAll('script[type="application/ld+json"]').forEach(function(x){try{var j=JSON.parse(x.textContent);[].concat(j["@graph"]||j).forEach(function(p){if(p&&/Product/.test(String(p["@type"]))){d.t=d.t||p.name;var b=p.brand;d.b=d.b||(b&&(b.name||b))||"";d.n=d.n||p.mpn||"";var o=[].concat(p.offers||[])[0];if(o&&!d.p)d.p=String(o.price||o.lowPrice||"")}})}catch(e){}});
d.t=q("#productTitle")||q("#title")||d.t||q("h1")||document.title;
d.b=d.b||q("#bylineInfo");
d.p=q("#corePrice_feature_div .a-offscreen")||q("#corePriceDisplay_desktop_feature_div .a-offscreen")||q("#corePrice_mobile_feature_div .a-offscreen")||q("#apex_offerDisplay_mobile .a-offscreen")||q(".priceToPay .a-offscreen")||q("#apex_desktop .a-price .a-offscreen")||d.p||q('[itemprop="price"]')||q(".a-price .a-offscreen");
if(!d.n){document.querySelectorAll("tr,li").forEach(function(r){if(d.n)return;var m=tx(r).match(/(Manufacturer Part Number|Part Number|Item model number|Part #)\\s*[:\\u200e\\u200f]*\\s*([A-Za-z0-9][A-Za-z0-9.\\-]{2,30})/i);if(m)d.n=m[2]})}
location.href=O+"/service/new?part="+encodeURIComponent(JSON.stringify(d));})();`;
  return "javascript:" + js.replace(/\n/g, "");
}

/** Settings card: the "Send to NitroLog" bookmark, with steps for a computer and for iPhone. */
export default function SendButtonSetup() {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);

  // React won't render a javascript: link, so the bookmark's address is set by hand.
  useEffect(() => {
    const c = bookmarkletCode(window.location.origin);
    setCode(c);
    link.current?.setAttribute("href", c);
  }, []);

  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt("Copy this:", code); }
  }

  return (
    <div className="card section key-setup">
      <div className="card-title">Send parts from a store page</div>
      <p className="settings-hint">
        A bookmark that adds the part you&apos;re looking at, with its price, to a new service record. It works on Amazon, AutoZone,
        O&apos;Reilly and most other stores, and it reads only the page you have open, in your own browser.
      </p>
      <div className="send-btn-row">
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
        <a ref={link} className="send-btn" onClick={e => e.preventDefault()} title="Drag me to your bookmarks bar">⇪ Send to NitroLog</a>
        <button type="button" className="btn-secondary btn-sm" onClick={copy} disabled={!code}>{copied ? "Copied" : "Copy the code"}</button>
      </div>
      <details className="send-steps">
        <summary>On a computer</summary>
        <ol className="guide-steps">
          <li>Show your bookmarks bar (<b>Ctrl+Shift+B</b>, or <b>⌘+Shift+B</b> on a Mac).</li>
          <li>Drag the <b>Send to NitroLog</b> button above onto the bar.</li>
          <li>On a product page, click it. NitroLog opens with the part and price filled in. Check the details and save.</li>
        </ol>
      </details>
      <details className="send-steps">
        <summary>On iPhone (Safari)</summary>
        <ol className="guide-steps">
          <li>Tap <b>Copy the code</b> above.</li>
          <li>Bookmark any page: tap the Share button, then <b>Add Bookmark</b>. Name it <b>Send to NitroLog</b> and save it.</li>
          <li>Tap the Bookmarks button (the open book), then <b>Edit</b>, then the new bookmark. Clear its address, paste the code there, and tap Done.</li>
          <li>On a product page in Safari, tap the Bookmarks button and then <b>Send to NitroLog</b>. In the Amazon app, tap Share → <b>Open in Safari</b> first.</li>
        </ol>
      </details>
    </div>
  );
}
