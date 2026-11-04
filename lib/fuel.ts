// Pure fuel-economy logic. Uses the fill-to-fill method: partial fills accumulate until the next full tank.

export type FuelPoint = { id: number; reading: number | null; volumeL: number; fullTank: boolean };

export type Economy = {
  /** Log id to meters per liter, for full fills that have a previous full fill to measure from. */
  byId: Record<number, number>;
  average: number | null;
};

export function computeEconomy(logs: FuelPoint[]): Economy {
  const known = logs.filter(l => l.reading !== null).sort((a, b) => a.reading! - b.reading! || a.id - b.id);
  const byId: Record<number, number> = {};
  let totalDistance = 0;
  let totalVolume = 0;
  let startReading: number | null = null;
  let volume = 0;

  for (const l of known) {
    if (startReading === null) {
      if (l.fullTank) startReading = l.reading;
      continue;
    }
    volume += l.volumeL;
    if (!l.fullTank) continue;
    const distance = l.reading! - startReading;
    if (distance > 0 && volume > 0) {
      byId[l.id] = distance / volume;
      totalDistance += distance;
      totalVolume += volume;
    }
    startReading = l.reading;
    volume = 0;
  }
  return { byId, average: totalVolume > 0 ? totalDistance / totalVolume : null };
}
