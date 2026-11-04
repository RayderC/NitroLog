"use client";

import { useParams } from "next/navigation";
import ServiceForm from "@/app/components/ServiceForm";

export default function ServiceRecordPage() {
  const { id } = useParams<{ id: string }>();
  return <ServiceForm serviceId={Number(id)} />;
}
