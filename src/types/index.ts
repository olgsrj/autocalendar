export type OwnershipStatus = 'active' | 'sold';

export type FuelType = 'ДТ' | '92' | '95' | '95+' | '100' | '100+' | 'Газ';

export interface ExtraPurchaseCost {
  id: string;
  name: string;
  cost: number;
}

export interface Car {
  id: string;
  name: string;
  year?: number;
  plateNumber?: string;
  vin?: string | null;
  status: OwnershipStatus;
  purchaseDate: string; // YYYY-MM-DD
  purchaseMileage: number;
  purchasePrice: number;
  selectionServiceCost: number;
  soldDate?: string | null;
  soldMileage?: number | null;
  soldPrice?: number | null;
  tankVolume: number;
  defaultFuelType: FuelType | string;
  manualMileage?: number | null;
  currentMileage: number;
  notes?: string | null;
  extraPurchaseCosts?: ExtraPurchaseCost[];
}

export interface Refueling {
  id: string;
  carId: string;
  date: string; // YYYY-MM-DD
  mileage: number;
  deltaKm: number;
  liters: number | null;
  stationPrice: number | null;
  actualCost: number;
  calculatedCost: number | null;
  discountAmount: number;
  effectiveLiterPrice: number | null;
  fuelType: FuelType | string;
  isFullTank: boolean;
  isMissedPrevious: boolean;
  consumption: number | null;
  rangeRemaining: number | null;
  photoId?: string | null;
  notes?: string | null;
}

export interface ServiceWorkItem {
  id: string;
  name: string;
  cost: number;
  maintenanceRuleId?: string | null;
}

export interface ServiceEvent {
  id: string;
  carId: string;
  date: string; // YYYY-MM-DD
  mileage: number | null;
  organization: string;
  address?: string | null;
  orderNumber?: string | null;
  items: ServiceWorkItem[];
  totalLaborCost: number;
  isCustomTotalLaborCost: boolean;
  attachedPartIds: string[];
  photoIds: string[];
  tireSetId?: string | null;
  notes?: string | null;
}

export interface MaintenanceRule {
  id: string;
  carId: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastReplacedKm: number | null;
  lastReplacedDate: string | null; // YYYY-MM-DD
  notifyEnabled: boolean;
  notes?: string | null;
}

export type PartStatus = 'installed' | 'in_stock' | 'wishlist';

export interface Part {
  id: string;
  carId: string;
  category: string;
  name: string;
  brand?: string | null;
  partNumber?: string | null;
  store?: string | null;
  productUrl?: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  status: PartStatus;
  purchaseDate?: string | null;
  installedMileage?: number | null;
  installedDate?: string | null;
  serviceEventId?: string | null;
  notes?: string | null;
}

export type TireSeason = 'summer' | 'winter_spikes' | 'winter_friction';

export interface TireSet {
  id: string;
  carId: string;
  name: string;
  season: TireSeason;
  dimension: string;
  manufactureYear: number;
  recommendedMaxAgeYears: number;
  purchasePrice: number;
  purchaseDate?: string | null;
  isMounted: boolean;
  mountedAtMileage: number;
  baseMileage: number;
  isArchived: boolean;
  productUrl?: string | null;
  notes?: string | null;
}

export interface MiscExpense {
  id: string;
  carId: string;
  date: string;
  name: string;
  type: string;
  cost: number;
  mileage?: number | null;
  organization?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface InsuranceDocument {
  id: string;
  carId: string;
  type: 'osago' | 'kasko' | 'other';
  company: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  cost: number;
  isIncludedInExpenses: boolean;
  fileUrl?: string | null;
  notes?: string | null;
}

export interface PhotoAttachment {
  id: string;
  carId: string;
  entityType: 'refueling' | 'service' | 'insurance' | 'car';
  entityId: string;
  dataUrl: string; // Base64
  createdAt: string;
}

export interface AppSettings {
  id?: string;
  theme: 'system' | 'dark' | 'light';
  monthlySalaryNet: number;
  activeCarId: string;
  maintenanceRemindKm: number;
  maintenanceRemindDays: number;
  tireMaxAgeYears: number;
  lastBackupDate?: string | null;
}

export interface BackupData {
  version: number;
  exportDate: string;
  cars: Car[];
  refuelings: Refueling[];
  serviceEvents: ServiceEvent[];
  maintenanceRules: MaintenanceRule[];
  parts: Part[];
  tireSets: TireSet[];
  miscExpenses: MiscExpense[];
  insurances: InsuranceDocument[];
  photos?: PhotoAttachment[];
  appSettings: AppSettings;
}

export type NavigationTab = 'home' | 'refuelings' | 'maintenance' | 'parts_tires' | 'analytics' | 'settings';
