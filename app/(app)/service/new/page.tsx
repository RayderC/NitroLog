"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ServiceForm from "@/app/components/ServiceForm";

function NewService() {
  const params = useSearchParams();
  const number = (key: string) => {
    const n = Number(params.get(key));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  return <ServiceForm initialVehicle={number("vehicle")} initialSchedule={number("schedule")} sentPart={params.get("part")} />;
}

export default function NewServicePage() {
  return <Suspense fallback={<div className="loading">Loading…</div>}><NewService /></Suspense>;
}
