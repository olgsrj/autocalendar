import { ref, computed, reactive } from 'vue';
import JSZip from 'jszip';
import { db } from '../db';
import type {
  Car,
  Refueling,
  ServiceEvent,
  MaintenanceRule,
  Part,
  TireSet,
  MiscExpense,
  InsuranceDocument,
  AppSettings,
  NavigationTab
} from '../types';
import {
  calculateCurrentMileage,
  calculateYearMileage,
  calculateDailyPace,
  calculateFinancialMetrics,
  recalculateRefuelingsChain,
  parseInputNumber
} from './calculations';

// 1. Navigation & Modals
export const currentTab = ref<NavigationTab>('home');
export const previousTab = ref<NavigationTab>('home');
export const activeMaintenanceSubTab = ref<'rules' | 'repairs' | 'other'>('rules');
export const activePartsSubTab = ref<'shelf' | 'installed' | 'tires' | 'osago'>('shelf');

export const isGarageModalOpen = ref(false);
export const isCarModalOpen = ref(false);
export const editingCar = ref<Car | null>(null);
export const isSellCarModalOpen = ref(false);

export const isRefuelModalOpen = ref(false);
export const editingRefueling = ref<Refueling | null>(null);

export const isQuickMileageModalOpen = ref(false);

export const isServiceModalOpen = ref(false);
export const editingServiceEvent = ref<ServiceEvent | null>(null);
export const preselectedRuleForService = ref<MaintenanceRule | null>(null);
export const preselectedPartForService = ref<string | null>(null);

export const isPartModalOpen = ref(false);
export const editingPart = ref<Part | null>(null);

export const isTireModalOpen = ref(false);
export const editingTireSet = ref<TireSet | null>(null);

export const isInsuranceModalOpen = ref(false);
export const editingInsurance = ref<InsuranceDocument | null>(null);

export const isMiscModalOpen = ref(false);
export const editingMisc = ref<MiscExpense | null>(null);

// Highlighting items when navigating from "Требует внимания"
export const highlightedRuleId = ref<string | null>(null);
export const highlightedTireSetId = ref<string | null>(null);
export const highlightedInsuranceId = ref<string | null>(null);

// 2. Data Collections
export const cars = ref<Car[]>([]);
export const activeCarId = ref<string>('');
export const refuelings = ref<Refueling[]>([]);
export const serviceEvents = ref<ServiceEvent[]>([]);
export const maintenanceRules = ref<MaintenanceRule[]>([]);
export const parts = ref<Part[]>([]);
export const tireSets = ref<TireSet[]>([]);
export const miscExpenses = ref<MiscExpense[]>([]);
export const insurances = ref<InsuranceDocument[]>([]);
export const appSettings = ref<AppSettings>({
  theme: 'system',
  monthlySalaryNet: 130000,
  activeCarId: '',
  maintenanceRemindKm: 1000,
  maintenanceRemindDays: 30,
  tireMaxAgeYears: 6
});

export const isLoading = ref(true);
export const isDatabaseEmpty = ref(false);

// Toast
export const toast = reactive({
  visible: false,
  message: '',
  timeoutId: 0 as unknown as ReturnType<typeof setTimeout>
});

export function showToast(message: string, duration = 2500) {
  toast.message = message;
  toast.visible = true;
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.visible = false;
  }, duration);
}

// 3. Computed Metrics for Active Car
export const activeCar = computed<Car | null>(() => {
  if (!activeCarId.value) return cars.value[0] || null;
  return cars.value.find(c => c.id === activeCarId.value) || cars.value[0] || null;
});

export const activeRefuelings = computed<Refueling[]>(() => {
  const cId = activeCarId.value;
  return refuelings.value.filter(r => r.carId === cId);
});

export const activeServiceEvents = computed<ServiceEvent[]>(() => {
  const cId = activeCarId.value;
  return serviceEvents.value.filter(s => s.carId === cId);
});

export const activeMaintenanceRules = computed<MaintenanceRule[]>(() => {
  const cId = activeCarId.value;
  return maintenanceRules.value.filter(m => m.carId === cId);
});

export const activeParts = computed<Part[]>(() => {
  const cId = activeCarId.value;
  return parts.value.filter(p => p.carId === cId);
});

export const activeTireSets = computed<TireSet[]>(() => {
  const cId = activeCarId.value;
  return tireSets.value.filter(t => t.carId === cId);
});

export const activeMiscExpenses = computed<MiscExpense[]>(() => {
  const cId = activeCarId.value;
  return miscExpenses.value.filter(m => m.carId === cId);
});

export const activeInsurances = computed<InsuranceDocument[]>(() => {
  const cId = activeCarId.value;
  return insurances.value.filter(i => i.carId === cId);
});

export const currentMileage = computed<number>(() => {
  const car = activeCar.value;
  if (!car) return 0;
  return calculateCurrentMileage(
    car,
    activeRefuelings.value,
    activeServiceEvents.value,
    activeParts.value
  );
});

export const currentYearMileageInfo = computed(() => {
  const car = activeCar.value;
  if (!car) return { yearMileage: 0, startKm: 0, maxKm: 0 };
  const currentYear = new Date().getFullYear();
  return calculateYearMileage(
    currentYear,
    car.purchaseMileage,
    activeRefuelings.value,
    activeServiceEvents.value
  );
});

export const dailyPaceKm = computed(() => {
  const car = activeCar.value;
  if (!car) return 0;
  const endDate = car.soldDate ? new Date(`${car.soldDate}T12:00:00`) : new Date();
  return calculateDailyPace(activeRefuelings.value, activeServiceEvents.value, endDate);
});

export const financialSummary = computed(() => {
  const car = activeCar.value;
  if (!car) {
    return {
      fuelCostTotal: 0,
      partsCostTotal: 0,
      serviceCostTotal: 0,
      miscCostTotal: 0,
      maintenanceTotal: 0,
      grandTotal: 0,
      costPerKm: 0,
      costPerDay: 0,
      costPerMonth: 0,
      costPerKmWithPurchase: 0,
      percentOfSalary: null,
      ownedMileage: 0,
      totalSavedDiscounts: 0
    };
  }
  return calculateFinancialMetrics(
    car,
    activeRefuelings.value,
    activeParts.value,
    activeServiceEvents.value,
    activeMiscExpenses.value,
    activeInsurances.value,
    currentMileage.value,
    appSettings.value.monthlySalaryNet
  );
});

// 4. Data Loading & Operations
export async function loadAllData() {
  isLoading.value = true;
  try {
    const [
      dbCars,
      dbRefuels,
      dbServices,
      dbRules,
      dbParts,
      dbTires,
      dbMisc,
      dbInsurances,
      dbSettings
    ] = await Promise.all([
      db.cars.toArray(),
      db.refuelings.toArray(),
      db.serviceEvents.toArray(),
      db.maintenanceRules.toArray(),
      db.parts.toArray(),
      db.tireSets.toArray(),
      db.miscExpenses.toArray(),
      db.insurances.toArray(),
      db.appSettings.toArray()
    ]);

    cars.value = dbCars;
    refuelings.value = dbRefuels;
    serviceEvents.value = dbServices;
    maintenanceRules.value = dbRules;
    parts.value = dbParts;
    tireSets.value = dbTires;
    miscExpenses.value = dbMisc;
    insurances.value = dbInsurances;

    if (dbSettings.length > 0) {
      appSettings.value = dbSettings[0];
    }

    if (cars.value.length === 0) {
      isDatabaseEmpty.value = true;
    } else {
      isDatabaseEmpty.value = false;
      if (!activeCarId.value || !cars.value.some(c => c.id === activeCarId.value)) {
        activeCarId.value = appSettings.value.activeCarId || cars.value[0].id;
      }
    }

    applyTheme(appSettings.value.theme);
  } catch (err) {
    console.error('Failed to load data from IndexedDB:', err);
    showToast('Ошибка загрузки данных из памяти устройства');
  } finally {
    isLoading.value = false;
  }
}

// 5. Theme management
export function applyTheme(theme: 'system' | 'dark' | 'light') {
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem('autocalendar_theme', theme);
}

export async function setTheme(theme: 'system' | 'dark' | 'light') {
  appSettings.value.theme = theme;
  applyTheme(theme);
  await db.appSettings.put({
    ...appSettings.value,
    id: 'global_settings',
    theme
  });
}

export function setActiveCar(carId: string) {
  activeCarId.value = carId;
  appSettings.value.activeCarId = carId;
  db.appSettings.put({
    ...appSettings.value,
    id: 'global_settings',
    activeCarId: carId
  });
}

// 6. Navigation helpers
export function navigateTo(tab: NavigationTab) {
  if (currentTab.value !== tab) previousTab.value = currentTab.value;
  currentTab.value = tab;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function navigateBack() {
  const target = previousTab.value === 'settings' ? 'home' : previousTab.value;
  currentTab.value = target;
  previousTab.value = 'home';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function navigateToMaintenanceRule(ruleId: string) {
  currentTab.value = 'maintenance';
  activeMaintenanceSubTab.value = 'rules';
  highlightedRuleId.value = ruleId;
  setTimeout(() => {
    const el = document.getElementById(`rule-card-${ruleId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
  setTimeout(() => {
    highlightedRuleId.value = null;
  }, 3500);
}

export function navigateToTireSet(tireId: string) {
  currentTab.value = 'parts_tires';
  activePartsSubTab.value = 'tires';
  highlightedTireSetId.value = tireId;
  setTimeout(() => {
    const el = document.getElementById(`tire-card-${tireId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
  setTimeout(() => {
    highlightedTireSetId.value = null;
  }, 3500);
}

export function navigateToInsurance(docId: string) {
  currentTab.value = 'parts_tires';
  activePartsSubTab.value = 'osago';
  highlightedInsuranceId.value = docId;
  setTimeout(() => {
    const el = document.getElementById(`doc-card-${docId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
  setTimeout(() => {
    highlightedInsuranceId.value = null;
  }, 3500);
}

// 8. CRUD Actions with Cascade Recalculation

// Refuelings
export async function saveRefueling(refuelData: Partial<Refueling>): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const id = refuelData.id || `refuel-${Date.now()}`;
  const record: Refueling = {
    id,
    carId: car.id,
    date: refuelData.date || new Date().toISOString().split('T')[0],
    mileage: parseInputNumber(refuelData.mileage),
    deltaKm: 0,
    liters: refuelData.liters !== undefined && refuelData.liters !== null ? parseInputNumber(refuelData.liters) : null,
    stationPrice: refuelData.stationPrice !== undefined && refuelData.stationPrice !== null ? parseInputNumber(refuelData.stationPrice) : null,
    actualCost: parseInputNumber(refuelData.actualCost),
    calculatedCost: null,
    discountAmount: 0,
    effectiveLiterPrice: null,
    fuelType: refuelData.fuelType || car.defaultFuelType || '95',
    isFullTank: refuelData.isFullTank ?? true,
    isMissedPrevious: refuelData.isMissedPrevious ?? false,
    consumption: null,
    rangeRemaining: null,
    photoId: refuelData.photoId || null,
    notes: refuelData.notes || null
  };

  await db.refuelings.put(record);

  // Каскадный пересчет цепочки заправок
  const allForCar = await db.refuelings.where('carId').equals(car.id).toArray();
  const recalculated = recalculateRefuelingsChain(allForCar, car.purchaseMileage, car.tankVolume);
  await db.refuelings.bulkPut(recalculated);

  // Обновление глобального пробега автомобиля
  const newMaxKm = Math.max(car.currentMileage, record.mileage);
  if (newMaxKm !== car.currentMileage) {
    car.currentMileage = newMaxKm;
    await db.cars.update(car.id, { currentMileage: newMaxKm });
  }

  await loadAllData();
  showToast(refuelData.id ? 'Заправка обновлена' : 'Заправка добавлена');
}

export async function deleteRefueling(id: string): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const removed = await db.refuelings.get(id);
  await db.refuelings.delete(id);
  if (removed?.photoId) await db.photos.delete(removed.photoId);

  const allForCar = await db.refuelings.where('carId').equals(car.id).toArray();
  const recalculated = recalculateRefuelingsChain(allForCar, car.purchaseMileage, car.tankVolume);
  await db.refuelings.bulkPut(recalculated);
  const updatedMileage = calculateCurrentMileage(car, recalculated, activeServiceEvents.value, activeParts.value);
  await db.cars.update(car.id, { currentMileage: updatedMileage });

  await loadAllData();
  showToast('Запись о заправке удалена');
}

// Manual mileage update
export async function updateManualMileage(km: number): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const validKm = Math.round(km);
  car.manualMileage = validKm;
  car.currentMileage = Math.max(car.currentMileage, validKm);
  await db.cars.update(car.id, {
    manualMileage: validKm,
    currentMileage: car.currentMileage
  });

  await loadAllData();
  showToast(`Пробег обновлен: ${validKm.toLocaleString('ru-RU')} км`);
}

// Service Order
export async function recalculateMaintenanceRulesForCar(carId: string, ruleIds?: Iterable<string>): Promise<void> {
  const events = await db.serviceEvents.where('carId').equals(carId).toArray();
  const ids = ruleIds ? new Set(ruleIds) : new Set((await db.maintenanceRules.where('carId').equals(carId).toArray()).map(rule => rule.id));

  for (const ruleId of ids) {
    const linkedEvents = events
      .filter(event => event.items.some(item => item.maintenanceRuleId === ruleId))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.mileage || 0) - (b.mileage || 0));
    const latest = linkedEvents[linkedEvents.length - 1];
    await db.maintenanceRules.update(ruleId, {
      lastReplacedKm: latest?.mileage ?? null,
      lastReplacedDate: latest?.date ?? null
    });
  }
}

async function syncCurrentMileage(car: Car): Promise<void> {
  const [carRefuelings, carServices, carParts] = await Promise.all([
    db.refuelings.where('carId').equals(car.id).toArray(),
    db.serviceEvents.where('carId').equals(car.id).toArray(),
    db.parts.where('carId').equals(car.id).toArray()
  ]);
  const mileage = calculateCurrentMileage(car, carRefuelings, carServices, carParts);
  car.currentMileage = mileage;
  await db.cars.update(car.id, { currentMileage: mileage });
}

export async function saveServiceEvent(
  eventData: Partial<ServiceEvent>,
  newPhotos: Array<{ id?: string; dataUrl: string }> = []
): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const id = eventData.id || `service-${Date.now()}`;
  const previous = await db.serviceEvents.get(id);
  const record: ServiceEvent = {
    id,
    carId: car.id,
    date: eventData.date || new Date().toISOString().split('T')[0],
    mileage: eventData.mileage !== undefined && eventData.mileage !== null ? parseInputNumber(eventData.mileage) : null,
    organization: eventData.organization || 'Самостоятельно',
    address: eventData.address || null,
    orderNumber: eventData.orderNumber || null,
    items: (eventData.items || []).map(item => ({ ...item })),
    totalLaborCost: parseInputNumber(eventData.totalLaborCost),
    isCustomTotalLaborCost: eventData.isCustomTotalLaborCost ?? false,
    attachedPartIds: [...(eventData.attachedPartIds || [])],
    photoIds: [...(eventData.photoIds || []), ...newPhotos.map((photo, index) => photo.id || `photo-${id}-${Date.now()}-${index}`)],
    tireSetId: eventData.tireSetId ?? null,
    notes: eventData.notes || null
  };
  const affectedRuleIds = new Set([
    ...(previous?.items || []),
    ...record.items
  ].map(item => item.maintenanceRuleId).filter((ruleId): ruleId is string => Boolean(ruleId)));
  const removedPartIds = (previous?.attachedPartIds || []).filter(partId => !record.attachedPartIds.includes(partId));
  const previousPhotoIds = previous?.photoIds || [];
  const removedPhotoIds = previousPhotoIds.filter(photoId => !record.photoIds.includes(photoId));

  await db.transaction('rw', [db.serviceEvents, db.maintenanceRules, db.parts, db.photos, db.cars, db.refuelings], async () => {
    await db.serviceEvents.put(record);
    for (const partId of removedPartIds) {
      await db.parts.update(partId, {
        status: 'in_stock',
        installedMileage: null,
        installedDate: null,
        serviceEventId: null
      });
    }
    for (const partId of record.attachedPartIds) {
      await db.parts.update(partId, {
        status: 'installed',
        installedMileage: record.mileage,
        installedDate: record.date,
        serviceEventId: record.id
      });
    }
    if (removedPhotoIds.length > 0) await db.photos.bulkDelete(removedPhotoIds);
    for (const [index, photo] of newPhotos.entries()) {
      await db.photos.put({
        id: record.photoIds[(eventData.photoIds || []).length + index],
        carId: car.id,
        entityType: 'service',
        entityId: id,
        dataUrl: photo.dataUrl,
        createdAt: new Date().toISOString()
      });
    }
    await recalculateMaintenanceRulesForCar(car.id, affectedRuleIds);
    await syncCurrentMileage(car);
  });

  await loadAllData();
  showToast(previous ? 'Заказ-наряд обновлен' : 'Заказ-наряд сохранен');
}

export async function deleteServiceEvent(id: string, returnPartsToStock = true): Promise<void> {
  const event = await db.serviceEvents.get(id);
  if (!event) return;
  const affectedRuleIds = event.items.map(item => item.maintenanceRuleId).filter((ruleId): ruleId is string => Boolean(ruleId));
  const car = cars.value.find(item => item.id === event.carId);

  await db.transaction('rw', [db.serviceEvents, db.maintenanceRules, db.parts, db.photos, db.cars, db.refuelings], async () => {
    for (const partId of event.attachedPartIds || []) {
      if (returnPartsToStock) {
        await db.parts.update(partId, {
          status: 'in_stock',
          installedMileage: null,
          installedDate: null,
          serviceEventId: null
        });
      } else {
        await db.parts.delete(partId);
      }
    }
    if (event.photoIds?.length) await db.photos.bulkDelete(event.photoIds);
    await db.serviceEvents.delete(id);
    await recalculateMaintenanceRulesForCar(event.carId, affectedRuleIds);
    if (car) await syncCurrentMileage(car);
  });
  await loadAllData();
  showToast('Заказ-наряд удален, регламент пересчитан');
}

// Parts
export async function savePart(partData: Partial<Part>): Promise<string | null> {
  const car = activeCar.value;
  if (!car) return null;

  const id = partData.id || `part-${Date.now()}`;
  const record: Part = {
    id,
    carId: car.id,
    category: partData.category || 'Деталь',
    name: partData.name || 'Запчасть',
    brand: partData.brand || null,
    partNumber: partData.partNumber || null,
    store: partData.store || null,
    productUrl: partData.productUrl || null,
    quantity: parseInputNumber(partData.quantity) || 1,
    unitPrice: partData.unitPrice ? parseInputNumber(partData.unitPrice) : null,
    totalPrice: partData.totalPrice ? parseInputNumber(partData.totalPrice) : null,
    status: partData.status || 'in_stock',
    purchaseDate: partData.purchaseDate || null,
    installedMileage: partData.installedMileage ? parseInputNumber(partData.installedMileage) : null,
    installedDate: partData.installedDate || null,
    serviceEventId: partData.serviceEventId || null,
    notes: partData.notes || null
  };

  await db.parts.put(record);
  await loadAllData();
  showToast(partData.id ? 'Деталь обновлена' : 'Деталь добавлена');
  return id;
}

export async function deletePart(id: string): Promise<void> {
  await db.parts.delete(id);
  await loadAllData();
  showToast('Деталь удалена');
}

// Tire sets
export async function saveTireSet(tireData: Partial<TireSet>): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const id = tireData.id || `tire-${Date.now()}`;
  const record: TireSet = {
    id,
    carId: car.id,
    name: tireData.name || 'Шины',
    season: tireData.season || 'summer',
    dimension: tireData.dimension || '195/55 R15',
    manufactureYear: tireData.manufactureYear || new Date().getFullYear(),
    recommendedMaxAgeYears: tireData.recommendedMaxAgeYears || 6,
    purchasePrice: parseInputNumber(tireData.purchasePrice),
    purchaseDate: tireData.purchaseDate || null,
    isMounted: tireData.isMounted ?? false,
    mountedAtMileage: parseInputNumber(tireData.mountedAtMileage),
    baseMileage: parseInputNumber(tireData.baseMileage),
    isArchived: tireData.isArchived ?? false,
    productUrl: tireData.productUrl || null,
    notes: tireData.notes || null
  };

  await db.tireSets.put(record);
  await loadAllData();
  showToast(tireData.id ? 'Комплект шин обновлен' : 'Комплект шин добавлен');
}

export async function deleteTireSet(id: string): Promise<void> {
  await db.tireSets.delete(id);
  await loadAllData();
  showToast('Комплект шин удален');
}

export async function mountTireSet(
  newTireId: string,
  mileage: number,
  recordServiceEvent = false,
  serviceCost = 0,
  organization = 'Шиномонтаж',
  options: { serviceEventId?: string; date?: string; description?: string; address?: string | null } = {}
): Promise<void> {
  const car = activeCar.value;
  if (!car) return;
  const currentTires = await db.tireSets.where('carId').equals(car.id).toArray();
  const previousEvent = options.serviceEventId ? await db.serviceEvents.get(options.serviceEventId) : undefined;
  const mountedTires = currentTires.filter(tire => tire.isMounted && tire.id !== newTireId);

  for (const tire of mountedTires) {
    const seasonDriven = previousEvent?.tireSetId === tire.id
      ? 0
      : Math.max(0, mileage - tire.mountedAtMileage);
    await db.tireSets.update(tire.id, {
      isMounted: false,
      baseMileage: (tire.baseMileage || 0) + seasonDriven
    });
  }

  await db.tireSets.update(newTireId, {
    isMounted: true,
    isArchived: false,
    mountedAtMileage: mileage
  });

  if (recordServiceEvent) {
    await saveServiceEvent({
      id: options.serviceEventId,
      date: options.date || new Date().toISOString().split('T')[0],
      mileage,
      organization,
      address: options.address || null,
      totalLaborCost: serviceCost,
      items: [{
        id: previousEvent?.items[0]?.id || `work-${Date.now()}`,
        name: options.description || 'Сезонный шиномонтаж и балансировка',
        cost: serviceCost
      }],
      attachedPartIds: previousEvent?.attachedPartIds || [],
      photoIds: previousEvent?.photoIds || [],
      tireSetId: newTireId
    });
  } else {
    await loadAllData();
  }
  showToast('Комплект шин успешно установлен на автомобиль!');
}

export async function archiveTireSet(id: string, isArchived: boolean): Promise<void> {
  const tire = await db.tireSets.get(id);
  const seasonDriven = isArchived && tire?.isMounted
    ? Math.max(0, currentMileage.value - tire.mountedAtMileage)
    : 0;
  await db.tireSets.update(id, {
    isArchived,
    isMounted: isArchived ? false : undefined,
    baseMileage: (tire?.baseMileage || 0) + seasonDriven
  });
  await loadAllData();
  showToast(isArchived ? 'Шины отправлены в архив' : 'Шины возвращены из архива');
}

// Insurance
export async function saveInsurance(insData: Partial<InsuranceDocument>): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const id = insData.id || `doc-${Date.now()}`;
  const record: InsuranceDocument = {
    id,
    carId: car.id,
    type: insData.type || 'osago',
    company: insData.company || 'Страховая компания',
    policyNumber: insData.policyNumber || '',
    startDate: insData.startDate || new Date().toISOString().split('T')[0],
    endDate: insData.endDate || new Date().toISOString().split('T')[0],
    cost: parseInputNumber(insData.cost),
    isIncludedInExpenses: insData.isIncludedInExpenses ?? true,
    fileUrl: insData.fileUrl || null,
    notes: insData.notes || null
  };

  await db.insurances.put(record);
  await loadAllData();
  showToast(insData.id ? 'Полис обновлен' : 'Полис сохранен');
}

export async function deleteInsurance(id: string): Promise<void> {
  await db.insurances.delete(id);
  await loadAllData();
  showToast('Полис удален');
}

// Misc expenses
export async function saveMiscExpense(miscData: Partial<MiscExpense>): Promise<void> {
  const car = activeCar.value;
  if (!car) return;

  const id = miscData.id || `misc-${Date.now()}`;
  const record: MiscExpense = {
    id,
    carId: car.id,
    date: miscData.date || new Date().toISOString().split('T')[0],
    name: miscData.name || 'Расход',
    type: miscData.type || 'Прочее',
    cost: parseInputNumber(miscData.cost),
    mileage: miscData.mileage !== undefined && miscData.mileage !== null ? parseInputNumber(miscData.mileage) : null,
    organization: miscData.organization || null,
    address: miscData.address || null,
    notes: miscData.notes || null
  };

  await db.miscExpenses.put(record);
  await loadAllData();
  showToast(miscData.id ? 'Запись обновлена' : 'Запись сохранена');
}

export async function deleteMiscExpense(id: string): Promise<void> {
  await db.miscExpenses.delete(id);
  await loadAllData();
  showToast('Запись удалена');
}

// Car Management
export async function saveCar(carData: Partial<Car>): Promise<void> {
  const id = carData.id || `car-${Date.now()}`;
  const record: Car = {
    id,
    name: carData.name || 'Новый автомобиль',
    year: carData.year ? parseInputNumber(carData.year) : undefined,
    plateNumber: carData.plateNumber || '',
    vin: carData.vin || null,
    status: carData.status || 'active',
    purchaseDate: carData.purchaseDate || new Date().toISOString().split('T')[0],
    purchaseMileage: parseInputNumber(carData.purchaseMileage),
    purchasePrice: parseInputNumber(carData.purchasePrice),
    selectionServiceCost: parseInputNumber(carData.selectionServiceCost),
    soldDate: carData.soldDate || null,
    soldMileage: carData.soldMileage ? parseInputNumber(carData.soldMileage) : null,
    soldPrice: carData.soldPrice ? parseInputNumber(carData.soldPrice) : null,
    tankVolume: parseInputNumber(carData.tankVolume) || 60,
    defaultFuelType: carData.defaultFuelType || '95',
    manualMileage: carData.manualMileage ? parseInputNumber(carData.manualMileage) : null,
    currentMileage: parseInputNumber(carData.currentMileage) || parseInputNumber(carData.purchaseMileage),
    notes: carData.notes || null,
    extraPurchaseCosts: (carData.extraPurchaseCosts || []).map(item => ({
      ...item,
      cost: parseInputNumber(item.cost)
    }))
  };

  await db.cars.put(record);
  activeCarId.value = id;
  await loadAllData();
  showToast(carData.id ? 'Автомобиль обновлен' : 'Автомобиль добавлен в гараж');
}

export async function deleteCar(carId: string): Promise<void> {
  await db.transaction('rw', [
    db.cars,
    db.refuelings,
    db.serviceEvents,
    db.maintenanceRules,
    db.parts,
    db.tireSets,
    db.miscExpenses,
    db.insurances,
    db.photos
  ], async () => {
    await db.cars.delete(carId);
    await db.refuelings.where('carId').equals(carId).delete();
    await db.serviceEvents.where('carId').equals(carId).delete();
    await db.maintenanceRules.where('carId').equals(carId).delete();
    await db.parts.where('carId').equals(carId).delete();
    await db.tireSets.where('carId').equals(carId).delete();
    await db.miscExpenses.where('carId').equals(carId).delete();
    await db.insurances.where('carId').equals(carId).delete();
    await db.photos.where('carId').equals(carId).delete();
  });

  const remaining = await db.cars.toArray();
  activeCarId.value = remaining[0]?.id || '';
  await loadAllData();
  showToast('Автомобиль и все его записи удалены');
}

// 9. App Settings & Backup Operations
export async function updateAppSettings(partial: Partial<AppSettings>): Promise<void> {
  appSettings.value = {
    ...appSettings.value,
    ...partial
  };
  await db.appSettings.put({
    ...appSettings.value,
    id: 'global_settings'
  });
  showToast('Настройки сохранены');
}

export async function exportBackupJson(): Promise<void> {
  const data = await db.exportBackup();
  const dateStr = new Date().toISOString().split('T')[0];
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autocalendar_backup_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await updateAppSettings({ lastBackupDate: new Date().toISOString() });
  showToast('Бэкап .json успешно сохранён!');
}

export async function exportBackupZip(): Promise<void> {
  const data = await db.exportBackup();
  const dateStr = new Date().toISOString().split('T')[0];
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(data, null, 2));

  if (data.photos && data.photos.length > 0) {
    const photosFolder = zip.folder('photos');
    data.photos.forEach((photo, idx) => {
      if (photo.dataUrl) {
        const parts = photo.dataUrl.split(',');
        const base64Data = parts[1] || parts[0];
        photosFolder?.file(`photo_${photo.id || idx}.jpg`, base64Data, { base64: true });
      }
    });
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autocalendar_backup_${dateStr}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  await updateAppSettings({ lastBackupDate: new Date().toISOString() });
  showToast('Архив бэкапа .zip успешно сохранён!');
}

export async function shareBackupFile(): Promise<void> {
  const data = await db.exportBackup();
  const dateStr = new Date().toISOString().split('T')[0];
  const jsonStr = JSON.stringify(data, null, 2);

  try {
    const file = new File([jsonStr], `autocalendar_backup_${dateStr}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Бэкап Автокалендарь',
        text: `Резервная копия от ${dateStr}`
      });
      showToast('Бэкап отправлен!');
      await updateAppSettings({ lastBackupDate: new Date().toISOString() });
      return;
    }
  } catch (err) {
    // If share aborted by user or not supported
    if ((err as Error)?.name === 'AbortError') return;
  }

  // Fallback to json download
  await exportBackupJson();
}

export async function clearAllDatabaseAndReset(): Promise<void> {
  await db.clearAllData();
  await loadAllData();
  showToast('Все данные приложения очищены');
}
