export function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function trailingDates(asOfDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftIsoDate(asOfDate, -index));
}

export function inclusiveDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  for (let ds = dateFrom; ds <= dateTo; ds = shiftIsoDate(ds, 1)) {
    dates.push(ds);
    if (dates.length > 90) {
      throw new Error("Date range cannot exceed 90 days");
    }
  }
  if (dates.length === 0) {
    throw new Error("dateFrom must be on or before dateTo");
  }
  return dates;
}
