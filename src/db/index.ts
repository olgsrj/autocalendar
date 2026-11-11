import Dexie, { type Table } from 'dexie';
import type {
  Car,
  Refueling,
  ServiceEvent,
  MaintenanceRule,
  Part,
  TireSet,
  MiscExpense,
  InsuranceDocument,
  PhotoAttachment,
  AppSettings,
  BackupData
} from '../types';

export class AutocalendarDatabase extends Dexie {
  cars!: Table<Car, string>;
  refuelings!: Table<Refueling, string>;
  serviceEvents!: Table<ServiceEvent, string>;
  maintenanceRules!: Table<MaintenanceRule, string>;
  parts!: Table<Part, string>;
  tireSets!: Table<TireSet, string>;
  miscExpenses!: Table<MiscExpense, string>;
  insurances!: Table<InsuranceDocument, string>;
  photos!: Table<PhotoAttachment, string>;
  appSettings!: Table<AppSettings, string>;

  constructor() {
    super('AutocalendarDB');

    this.version(1).stores({
      cars: 'id, name, status, purchaseDate',
      refuelings: 'id, carId, date, mileage, fuelType',
      serviceEvents: 'id, carId, date, mileage, organization',
      maintenanceRules: 'id, carId, name',
      parts: 'id, carId, category, status, installedMileage, serviceEventId',
      tireSets: 'id, carId, season, isMounted, isArchived',
      miscExpenses: 'id, carId, date, type',
      insurances: 'id, carId, startDate, endDate',
      photos: 'id, carId, entityType, entityId',
      appSettings: 'id'
    });
  }

  async clearAllData(): Promise<void> {
    await this.transaction('rw', [
      this.cars,
      this.refuelings,
      this.serviceEvents,
      this.maintenanceRules,
      this.parts,
      this.tireSets,
      this.miscExpenses,
      this.insurances,
      this.photos,
      this.appSettings
    ], async () => {
      await Promise.all([
        this.cars.clear(),
        this.refuelings.clear(),
        this.serviceEvents.clear(),
        this.maintenanceRules.clear(),
        this.parts.clear(),
        this.tireSets.clear(),
        this.miscExpenses.clear(),
        this.insurances.clear(),
        this.photos.clear(),
        this.appSettings.clear()
      ]);
    });
  }

  async importBackup(data: BackupData, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
    await this.transaction('rw', [
      this.cars,
      this.refuelings,
      this.serviceEvents,
      this.maintenanceRules,
      this.parts,
      this.tireSets,
      this.miscExpenses,
      this.insurances,
      this.photos,
      this.appSettings
    ], async () => {
      if (mode === 'replace') {
        await Promise.all([
          this.cars.clear(),
          this.refuelings.clear(),
          this.serviceEvents.clear(),
          this.maintenanceRules.clear(),
          this.parts.clear(),
          this.tireSets.clear(),
          this.miscExpenses.clear(),
          this.insurances.clear(),
          this.photos.clear(),
          this.appSettings.clear()
        ]);
      }

      if (data.cars && data.cars.length > 0) {
        await this.cars.bulkPut(data.cars);
      }
      if (data.refuelings && data.refuelings.length > 0) {
        await this.refuelings.bulkPut(data.refuelings);
      }
      if (data.serviceEvents && data.serviceEvents.length > 0) {
        await this.serviceEvents.bulkPut(data.serviceEvents);
      }
      if (data.maintenanceRules && data.maintenanceRules.length > 0) {
        await this.maintenanceRules.bulkPut(data.maintenanceRules);
      }
      if (data.parts && data.parts.length > 0) {
        await this.parts.bulkPut(data.parts);
      }
      if (data.tireSets && data.tireSets.length > 0) {
        await this.tireSets.bulkPut(data.tireSets);
      }
      if (data.miscExpenses && data.miscExpenses.length > 0) {
        await this.miscExpenses.bulkPut(data.miscExpenses);
      }
      if (data.insurances && data.insurances.length > 0) {
        await this.insurances.bulkPut(data.insurances);
      }
      if (data.photos && data.photos.length > 0) {
        await this.photos.bulkPut(data.photos);
      }
      if (data.appSettings) {
        await this.appSettings.put({
          ...data.appSettings,
          id: 'global_settings'
        });
      }
    });
  }

  async exportBackup(): Promise<BackupData> {
    const [
      cars,
      refuelings,
      serviceEvents,
      maintenanceRules,
      parts,
      tireSets,
      miscExpenses,
      insurances,
      photos,
      settingsArray
    ] = await Promise.all([
      this.cars.toArray(),
      this.refuelings.toArray(),
      this.serviceEvents.toArray(),
      this.maintenanceRules.toArray(),
      this.parts.toArray(),
      this.tireSets.toArray(),
      this.miscExpenses.toArray(),
      this.insurances.toArray(),
      this.photos.toArray(),
      this.appSettings.toArray()
    ]);

    const appSettings = settingsArray[0] || {
      theme: 'system',
      monthlySalaryNet: 130000,
      activeCarId: cars[0]?.id || '',
      maintenanceRemindKm: 1000,
      maintenanceRemindDays: 30,
      tireMaxAgeYears: 6
    };

    return {
      version: 1,
      exportDate: new Date().toISOString(),
      cars,
      refuelings,
      serviceEvents,
      maintenanceRules,
      parts,
      tireSets,
      miscExpenses,
      insurances,
      photos,
      appSettings: {
        ...appSettings,
        lastBackupDate: new Date().toISOString()
      }
    };
  }
}

export const db = new AutocalendarDatabase();
