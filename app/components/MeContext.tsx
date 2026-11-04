"use client";

import { createContext, useContext } from "react";
import type { DistanceUnit, VolumeUnit } from "@/lib/units";

export type Me = {
  id: number;
  username: string;
  isAdmin: boolean;
  distanceUnit: DistanceUnit;
  volumeUnit: VolumeUnit;
};

export const MeContext = createContext<{ me: Me; reloadMe: () => void } | null>(null);

export function useMe() {
  const v = useContext(MeContext);
  if (!v) throw new Error("useMe outside MeContext");
  return v;
}
