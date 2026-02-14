import { PRICES } from "./config.js";

export function money(n){
  const v = Math.round(Number(n || 0));
  const s = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "R" + s;
}

export function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

export function daysBetween(start, end){
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0,0,0,0); e.setHours(0,0,0,0);
  const diff = Math.round((e - s) / (1000*60*60*24)) + 1;
  return Math.max(1, diff);
}

export function addDaysIso(startStr, daysToAdd){
  const dt = new Date(startStr);
  dt.setDate(dt.getDate() + daysToAdd);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isPeakDate(dateObj){
  const m = dateObj.getMonth();
  const d = dateObj.getDate();
  if (m === 5 || m === 6) return true;
  if (m === 11) return true;
  if (m === 0 && d <= 15) return true;
  return false;
}

export function bookingHasPeak(startStr, endStr){
  if (!startStr || !endStr) return false;
  const s = new Date(startStr);
  const e = new Date(endStr);
  s.setHours(0,0,0,0); e.setHours(0,0,0,0);
  for (let dt = new Date(s); dt <= e; dt.setDate(dt.getDate()+1)){
    if (isPeakDate(dt)) return true;
  }
  return false;
}

export function weightedDays(days){
  const block = Math.max(1, Number(PRICES.longStay.blockDays || 10));
  const factor = Number(PRICES.longStay.factor || 0.9);
  const capBlocks = Math.max(0, Number(PRICES.longStay.capBlocks ?? 2));

  let remaining = days;
  let total = 0;
  let i = 0;

  while (remaining > 0){
    const chunk = Math.min(block, remaining);
    const exp = Math.min(i, capBlocks);
    const mult = Math.pow(factor, exp);
    total += chunk * mult;
    remaining -= chunk;
    i += 1;
  }
  return total;
}

export function includedPetCount(dogs, cats){
  const inc = Math.max(0, Number(PRICES.controls.includedPets || 1));
  if (inc <= 0) return { incDogs: 0, incCats: 0 };
  if (dogs > 0) return { incDogs: Math.min(dogs, inc), incCats: 0 };
  return { incDogs: 0, incCats: Math.min(cats, inc) };
}
