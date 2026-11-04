"use client";

import AttachmentList from "@/app/components/AttachmentList";
import type { Vehicle } from "@/lib/types";

export default function DocumentsTab({ vehicle: v }: { vehicle: Vehicle }) {
  return (
    <div className="section">
      <p className="settings-hint" style={{ marginBottom: 12 }}>Photos and PDFs up to 25 MB each. Files on service records and build log entries also appear here.</p>
      <AttachmentList vehicleId={v.id} canEdit={v.role !== "viewer"} showCategories />
    </div>
  );
}
