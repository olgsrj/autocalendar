import type { Car, Refueling, ServiceEvent, Part, MiscExpense, InsuranceDocument } from '../types';

/**
 * Парсер числовых инпутов с защитой от запятой на русской мобильной клавиатуре
 */
export function parseInputNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).trim().replace(/\s+/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function formatCurrency(amount: number | null | undefined, includeDecimals = false): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0 ₽';
  const formatted = Math.abs(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0
  });
  return `${amount < 0 ? '-' : ''}${formatted} ₽`;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || isNaN(km)) return '0 км';
  return `${Math.round(km).toLocaleString('ru-RU')} км`;
}

export function formatLiters(liters: number | null | undefined): string {
  if (liters === null || liters === undefined || isNaN(liters)) return '0 л';
  return `${liters.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} л`;
}

export function formatDateRu(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

/**
 * Русское склонение числительных (1 день, 2 дня, 5 дней)
 */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${abs} ${many}`;
  if (mod10 === 1) return `${abs} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${abs} ${few}`;
  return `${abs} ${many}`;
}

export function formatDurationRu(daysCount: number): string {
  const isNegative = daysCount < 0;
  let remainingDays = Math.abs(Math.round(daysCount));

  const years = Math.floor(remainingDays / 365);
  remainingDays %= 365;
  const months = Math.floor(remainingDays / 30);
  const days = remainingDays % 30;

  const parts: string[] = [];
  if (years > 0) parts.push(pluralize(years, 'год', 'года', 'лет'));
  if (months > 0) parts.push(pluralize(months, 'месяц', 'месяца', 'месяцев'));
  if (days > 0 || parts.length === 0) parts.push(pluralize(days, 'день', 'дня', 'дней'));

  const text = parts.join(' и ');
  return isNegative ? `Просрочено на ${text}` : `Осталось ${text}`;
}

/**
 * Каскадный пересчёт цепочки заправок
 */
export function recalculateRefuelingsChain(
  refuelingsList: Refueling[],
  purchaseMileage: number,
  tankVolume = 60
): Refueling[] {
  const sorted = [...refuelingsList].sort((a, b) => {
    if (a.mileage !== b.mileage) return a.mileage - b.mileage;
    return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  });

  let accumulatedLiters = 0;
  let accumulatedKm = 0;

  return sorted.map((refueling, index) => {
    const previousKm = index > 0 ? sorted[index - 1].mileage : purchaseMileage;
    const deltaKm = Math.max(0, refueling.mileage - previousKm);
    const liters = refueling.liters;
    const stationPrice = refueling.stationPrice;
    const calculatedCost = liters && stationPrice
      ? Math.round(liters * stationPrice * 100) / 100
      : null;
    const difference = calculatedCost === null
      ? 0
      : Math.round((calculatedCost - refueling.actualCost) * 100) / 100;
    const discountAmount = difference > 0.5 ? difference : 0;
    const effectiveLiterPrice = liters
      ? Math.round((refueling.actualCost / liters) * 100) / 100
      : null;

    let consumption: number | null = null;
    let rangeRemaining: number | null = null;

    if (refueling.isMissedPrevious || liters === null || deltaKm <= 0) {
      accumulatedLiters = 0;
      accumulatedKm = 0;
    } else if (!refueling.isFullTank) {
      accumulatedLiters += liters;
      accumulatedKm += deltaKm;
    } else {
      const totalLiters = liters + accumulatedLiters;
      const totalKm = deltaKm + accumulatedKm;
      if (totalKm > 0) {
        consumption = Math.round((totalLiters / totalKm) * 10_000) / 100;
        rangeRemaining = Math.round((tankVolume / consumption) * 100);
      }
      accumulatedLiters = 0;
      accumulatedKm = 0;
    }

    return {
      ...refueling,
      deltaKm,
      calculatedCost,
      discountAmount,
      effectiveLiterPrice,
      consumption,
      rangeRemaining
    };
  });
}

/**
 * Текущий глобальный пробег автомобиля
 */
export function calculateCurrentMileage(
  car: Car,
  refuelings: Refueling[],
  serviceEvents: ServiceEvent[],
  parts: Part[]
): number {
  let maxKm = Math.max(car.purchaseMileage, car.manualMileage || 0);

  for (const r of refuelings) {
    if (r.mileage && r.mileage > maxKm) maxKm = r.mileage;
  }
  for (const s of serviceEvents) {
    if (s.mileage && s.mileage > maxKm) maxKm = s.mileage;
  }
  for (const p of parts) {
    if (p.installedMileage && p.installedMileage > maxKm) maxKm = p.installedMileage;
  }

  return maxKm;
}

/**
 * Пробег за текущий календарный год
 */
export function calculateYearMileage(
  year: number,
  purchaseMileage: number,
  refuelings: Refueling[],
  serviceEvents: ServiceEvent[]
): { yearMileage: number; startKm: number; maxKm: number } {
  const currentYearStr = String(year);
  let previousMaxKm = purchaseMileage;
  let currentMinKm: number | null = null;
  let currentMaxKm = purchaseMileage;

  const checkPoint = (date: string, km: number | null) => {
    if (!km) return;
    if (date < `${currentYearStr}-01-01`) {
      previousMaxKm = Math.max(previousMaxKm, km);
    } else if (date.startsWith(currentYearStr)) {
      currentMinKm = currentMinKm === null ? km : Math.min(currentMinKm, km);
      currentMaxKm = Math.max(currentMaxKm, km);
    }
  };

  for (const refueling of refuelings) checkPoint(refueling.date, refueling.mileage);
  for (const event of serviceEvents) checkPoint(event.date, event.mileage);

  const startKm = currentMinKm ?? previousMaxKm;
  const maxKm = currentMinKm === null ? previousMaxKm : currentMaxKm;
  return { yearMileage: Math.max(0, maxKm - startKm), startKm, maxKm };
}

/**
 * Дней владения
 */
export function calculateOwnershipDays(purchaseDate: string, soldDate?: string | null): number {
  const start = new Date(purchaseDate).getTime();
  const end = soldDate ? new Date(soldDate).getTime() : new Date().getTime();
  const diffDays = Math.max(1, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
  return diffDays;
}

/**
 * Полный финансовый расчет
 */
export interface FinancialSummary {
  fuelCostTotal: number;
  partsCostTotal: number;
  serviceCostTotal: number;
  miscCostTotal: number;
  maintenanceTotal: number;
  grandTotal: number;
  costPerKm: number;
  costPerDay: number;
  costPerMonth: number;
  costPerKmWithPurchase: number;
  percentOfSalary: number | null;
  ownedMileage: number;
  totalSavedDiscounts: number;
}

export function calculateDailyPace(
  refuelings: Refueling[],
  serviceEvents: ServiceEvent[],
  endDate = new Date()
): number {
  const endTime = endDate.getTime();
  const startTime = endTime - 180 * 86_400_000;
  const points = [...refuelings, ...serviceEvents]
    .filter((entry) => entry.mileage !== null && entry.date)
    .map((entry) => ({ date: new Date(`${entry.date}T12:00:00`).getTime(), mileage: entry.mileage as number }))
    .filter((entry) => Number.isFinite(entry.date) && entry.date <= endTime && entry.date >= startTime)
    .sort((a, b) => a.date - b.date || a.mileage - b.mileage);

  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  const days = Math.max(1, Math.round((last.date - first.date) / 86_400_000));
  return Math.max(0, last.mileage - first.mileage) / days;
}

export function calculateFinancialMetrics(
  car: Car,
  refuelings: Refueling[],
  parts: Part[],
  serviceEvents: ServiceEvent[],
  miscExpenses: MiscExpense[],
  insurances: InsuranceDocument[],
  currentMileage: number,
  salaryNet?: number
): FinancialSummary {
  const fuelCostTotal = refuelings.reduce((sum, r) => sum + (r.actualCost || 0), 0);
  const partsCostTotal = parts.reduce((sum, part) => {
    return part.status === 'wishlist' ? sum : sum + (part.totalPrice || 0);
  }, 0);
  const serviceCostTotal = serviceEvents.reduce((sum, event) => sum + (event.totalLaborCost || 0), 0);
  const standaloneInsuranceCost = insurances.reduce(
    (sum, policy) => sum + (policy.isIncludedInExpenses ? policy.cost || 0 : 0),
    0
  );
  const miscCostTotal = miscExpenses.reduce((sum, expense) => sum + (expense.cost || 0), standaloneInsuranceCost);
  const maintenanceTotal = Math.round((fuelCostTotal + partsCostTotal + serviceCostTotal + miscCostTotal) * 100) / 100;
  const extraCosts = (car.selectionServiceCost || 0)
    + (car.extraPurchaseCosts || []).reduce((sum, cost) => sum + cost.cost, 0);
  const grandTotal = Math.round((maintenanceTotal + car.purchasePrice + extraCosts) * 100) / 100;
  const ownedMileage = Math.max(0, currentMileage - car.purchaseMileage);
  const ownershipDays = calculateOwnershipDays(car.purchaseDate, car.soldDate);
  const costPerKm = ownedMileage > 0 ? Math.round((maintenanceTotal / ownedMileage) * 100) / 100 : 0;
  const costPerKmWithPurchase = ownedMileage > 0 ? Math.round((grandTotal / ownedMileage) * 100) / 100 : 0;
  const costPerDay = Math.round((maintenanceTotal / ownershipDays) * 100) / 100;
  const costPerMonth = Math.round(costPerDay * 30 * 100) / 100;
  const percentOfSalary = salaryNet && salaryNet > 0
    ? Math.round((costPerMonth / salaryNet) * 1000) / 10
    : null;
  const totalSavedDiscounts = refuelings.reduce((sum, r) => sum + (r.discountAmount || 0), 0);

  return {
    fuelCostTotal,
    partsCostTotal,
    serviceCostTotal,
    miscCostTotal,
    maintenanceTotal,
    grandTotal,
    costPerKm,
    costPerDay,
    costPerMonth,
    costPerKmWithPurchase,
    percentOfSalary,
    ownedMileage,
    totalSavedDiscounts
  };
}
