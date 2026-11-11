#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/convert_excel_to_backup.py
Скрипт миграции базы данных из Автокалендарь.xlsx в autocalendar_initial_backup.json
для Local-First PWA приложения «Автокалендарь».
"""

import os
import sys
import json
import uuid
import datetime
from pathlib import Path
import openpyxl

# Обеспечиваем корректный вывод UTF-8 в терминале Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXCEL_PATH = PROJECT_ROOT / "Автокалендарь.xlsx"
OUTPUT_JSON_PATH = PROJECT_ROOT / "autocalendar_initial_backup.json"


def safe_float(val, default=None):
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).strip().replace(" ", "").replace(",", ".")
    if not val_str:
        return default
    try:
        return float(val_str)
    except ValueError:
        return default


def safe_int(val, default=None):
    f = safe_float(val, None)
    return int(round(f)) if f is not None else default


def format_date(val):
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if not s:
        return None
    return s.split("T")[0]


def run_conversion():
    if not EXCEL_PATH.exists():
        print(f"❌ Ошибка: файл не найден: {EXCEL_PATH}")
        sys.exit(1)

    print(f"📂 Чтение исходного файла: {EXCEL_PATH} ...")
    wb = openpyxl.load_workbook(str(EXCEL_PATH), data_only=True)

    # 1. Чтение листа «Общее» для сверки контрольных сумм
    ws_general = wb['Общее']
    general_map = {}
    for row in ws_general.iter_rows(values_only=True):
        if row[0] is not None:
            general_map[str(row[0]).strip()] = row[1]

    expected_car_name = general_map.get("Автомобиль", "Chevrolet Lacetti")
    expected_purchase_date = format_date(general_map.get("Дата покупки"))
    expected_purchase_mileage = 130712  # 203408 - 72696
    expected_purchase_price = safe_float(general_map.get("Цена покупки автомобиля"), 360000.0)
    expected_selection_cost = safe_float(general_map.get("Стоимость услуг подборщиков"), 25000.0)
    expected_fuel_cost = safe_float(general_map.get("Стоимость бензина"), 366325.24)
    expected_parts_cost = safe_float(general_map.get("Стоимость запчастей"), 123831.0)
    expected_service_cost = safe_float(general_map.get("Стоимость сервиса"), 114830.0)
    expected_misc_cost = safe_float(general_map.get("Прочие траты"), 28275.39)
    expected_total_maint = safe_float(general_map.get("...из них на обслуживание"), 633261.63)
    expected_grand_total = safe_float(general_map.get("Всего потрачено"), 1018261.63)
    expected_current_mileage = safe_int(general_map.get("Текущий пробег, км"), 203408)
    expected_salary = safe_float(general_map.get("Зарплата"), 130000.0)

    car_id = "car-lacetti-2009"

    # 2. Обработка листа «Заправки + пробег»
    print("⛽ Обработка заправок...")
    ws_fuel = wb['Заправки + пробег']
    raw_refuelings = []

    for r_idx, row in enumerate(ws_fuel.iter_rows(values_only=True), start=1):
        if r_idx == 1:
            continue
        d_val = row[0]
        km_val = row[1]
        delta_val = row[2]
        liters_val = row[3]
        price_val = row[4]
        cost_val = row[5]

        # Пропускаем пустые строки
        parsed_km = safe_float(km_val)
        parsed_cost = safe_float(cost_val)
        if d_val is None and parsed_km is None and parsed_cost is None:
            continue
        if parsed_km is None:
            continue

        # Исправление опечатки даты на 186355 км: 2025-04-01 -> 2025-05-01
        if parsed_km == 186355:
            d_val = datetime.date(2025, 5, 1)

        raw_refuelings.append({
            "excelRow": r_idx,
            "date": format_date(d_val),
            "mileage": parsed_km,
            "deltaKm": safe_float(delta_val, 0.0),
            "liters": safe_float(liters_val),
            "stationPrice": safe_float(price_val),
            "actualCost": safe_float(cost_val, 0.0)
        })

    # Сортировка строго по пробегу (ASC), при равенстве - по дате
    raw_refuelings.sort(key=lambda x: (x["mileage"], x["date"]))

    # Каскадный расчёт цепочки заправок
    refuelings = []
    accumulated_liters = 0.0
    accumulated_km = 0.0

    for idx, item in enumerate(raw_refuelings):
        refuel_id = f"refuel-{idx + 1:04d}"
        km = item["mileage"]
        prev_km = raw_refuelings[idx - 1]["mileage"] if idx > 0 else expected_purchase_mileage
        delta_km = km - prev_km

        liters = item["liters"]
        station_price = item["stationPrice"]
        actual_cost = item["actualCost"]

        # Расчёт скидок
        calculated_cost = None
        discount_amount = 0.0
        effective_liter_price = None

        if liters and station_price:
            calculated_cost = round(liters * station_price, 2)
            diff = round(calculated_cost - actual_cost, 2)
            if diff > 0.5:
                discount_amount = diff
            effective_liter_price = round(actual_cost / liters, 2)
        elif liters and liters > 0:
            effective_liter_price = round(actual_cost / liters, 2)

        # Флаг полного бака: последняя дозаправка 203408 - частичная (дельта 48 км, 21 л)
        if km == 203408:
            is_full_tank = False
        else:
            is_full_tank = True

        is_missed_previous = False
        consumption = None
        range_remaining = None

        if is_missed_previous or liters is None or delta_km <= 0:
            consumption = None
            accumulated_liters = 0.0
            accumulated_km = 0.0
        elif not is_full_tank:
            accumulated_liters += liters
            accumulated_km += delta_km
            consumption = None
        else:
            total_liters = liters + accumulated_liters
            total_km = delta_km + accumulated_km
            if total_km > 0:
                consumption = round((total_liters / total_km) * 100.0, 2)
                if consumption > 0:
                    range_remaining = round((60.0 / consumption) * 100.0)
            accumulated_liters = 0.0
            accumulated_km = 0.0

        refuelings.append({
            "id": refuel_id,
            "carId": car_id,
            "date": item["date"],
            "mileage": km,
            "deltaKm": delta_km,
            "liters": liters,
            "stationPrice": station_price,
            "actualCost": round(actual_cost, 2),
            "calculatedCost": calculated_cost,
            "discountAmount": round(discount_amount, 2),
            "effectiveLiterPrice": effective_liter_price,
            "fuelType": "95",
            "isFullTank": is_full_tank,
            "isMissedPrevious": is_missed_previous,
            "consumption": consumption,
            "rangeRemaining": range_remaining,
            "photoId": None,
            "notes": None
        })

    # 3. Обработка листа «Сервис» (группировка в 27 заказ-нарядов)
    print("🔧 Обработка сервисных заказ-нарядов...")
    ws_svc = wb['Сервис']
    service_groups = {}

    for r_idx in range(2, 52):
        row = ws_svc[r_idx]
        d_val = row[0].value
        km_val = row[1].value
        work_val = row[2].value
        cost_val = safe_float(row[3].value, 0.0)
        org_val = row[4].value
        addr_val = row[5].value
        order_val = row[6].value

        if not work_val and cost_val == 0.0:
            continue

        d_str = format_date(d_val)
        km_float = safe_float(km_val)

        # Нормализация адресов сервиса Slok
        if org_val and "slok" in str(org_val).lower():
            addr_val = "г. Москва, ул. Примерная, д. 1"
        elif org_val and "gm club" in str(org_val).lower():
            addr_val = "г. Москва, ул. Образцовая, д. 2"

        key = (d_str, km_float, str(org_val) if org_val else "Самостоятельно")

        if key not in service_groups:
            service_groups[key] = {
                "id": f"service-{len(service_groups) + 1:03d}",
                "carId": car_id,
                "date": d_str,
                "mileage": km_float,
                "organization": org_val or "Самостоятельно",
                "address": addr_val,
                "orderNumber": str(order_val) if order_val else None,
                "items": [],
                "totalLaborCost": 0.0,
                "isCustomTotalLaborCost": False,
                "attachedPartIds": [],
                "photoIds": [],
                "notes": None
            }

        service_groups[key]["items"].append({
            "id": f"work-{uuid.uuid4().hex[:8]}",
            "name": str(work_val).strip() if work_val else "Работа",
            "cost": round(cost_val, 2),
            "maintenanceRuleId": None
        })
        service_groups[key]["totalLaborCost"] = round(service_groups[key]["totalLaborCost"] + cost_val, 2)

    service_events = list(service_groups.values())
    service_events.sort(key=lambda x: (x["date"] or "", x["mileage"] or 0))

    # 4. Обработка листа «Календарь замены» (9 узлов регламента ТО)
    print("📋 Обработка регламента ТО...")
    ws_cal = wb['Календарь замены']
    maintenance_rules = []

    for r_idx in range(3, 12):
        row = ws_cal[r_idx]
        name_val = row[0].value
        if not name_val:
            continue
        int_km = safe_float(row[1].value)
        int_days = safe_float(row[2].value)
        last_km = safe_float(row[3].value)
        last_date = format_date(row[4].value)

        rule_id = f"rule-{r_idx - 2:02d}"
        maintenance_rules.append({
            "id": rule_id,
            "carId": car_id,
            "name": str(name_val).strip(),
            "intervalKm": int_km,
            "intervalDays": int_days,
            "lastReplacedKm": last_km,
            "lastReplacedDate": last_date,
            "notifyEnabled": True,
            "notes": None
        })

    # Привязка работ в service_events к регламентам ТО
    rule_keywords = {
        "rule-01": ["моторного масла", "масляного фильтра", "масло моторное"],
        "rule-02": ["акпп", "масло в акпп"],
        "rule-03": ["воздушн"],
        "rule-04": ["салонн"],
        "rule-05": ["топливн"],
        "rule-06": ["грм"],
        "rule-07": ["тормозная жидкость", "тормозной жидк"],
        "rule-08": ["свеч"],
        "rule-09": ["антифриз", "охлаждающ"]
    }

    for se in service_events:
        for item in se["items"]:
            w_lower = item["name"].lower()
            for r_id, keywords in rule_keywords.items():
                if any(kw in w_lower for kw in keywords):
                    item["maintenanceRuleId"] = r_id
                    break

    # 5. Обработка листа «Расходники» (84 строки)
    print("📦 Обработка запчастей и склада...")
    ws_parts = wb['Расходники']
    parts = []
    tire_set_from_row_10 = None

    for r_idx in range(2, 86):
        row = ws_parts[r_idx]
        d_val = row[0].value
        cat_val = row[1].value
        name_val = row[2].value
        store_val = row[3].value
        art_val = row[4].value
        km_val = row[5].value
        price_val = row[6].value
        qty_val = row[7].value
        unit_price_val = row[8].value

        parsed_price = safe_float(price_val)
        if not cat_val and not name_val and parsed_price is None:
            continue

        # В строках 2–5 заменяем формульные ссылки пробега на 130750 км
        if r_idx in (2, 3, 4, 5):
            km_val = 130750.0

        part_id = f"part-{r_idx - 1:03d}"
        art_str = str(art_val).replace(".0", "") if art_val is not None else None

        # Определение статуса
        if r_idx >= 80:
            status = "wishlist"
            total_price = None
            unit_price = None
            purchase_date = None
            installed_km = None
            installed_date = None
        else:
            total_price = safe_float(price_val, 0.0)
            qty = safe_float(qty_val, 1.0)
            unit_price = safe_float(unit_price_val, round(total_price / qty, 2) if qty else total_price)
            purchase_date = format_date(d_val)
            installed_km = safe_float(km_val)
            status = "installed" if installed_km is not None else "in_stock"
            installed_date = purchase_date if status == "installed" else None

        # Привязка к заказ-наряду по пробегу
        matched_se_id = None
        if installed_km:
            for se in service_events:
                if se["mileage"] == installed_km:
                    matched_se_id = se["id"]
                    if part_id not in se["attachedPartIds"]:
                        se["attachedPartIds"].append(part_id)
                    break

        part_obj = {
            "id": part_id,
            "carId": car_id,
            "category": str(cat_val).strip() if cat_val else "Деталь",
            "name": str(name_val).strip() if name_val else (str(cat_val).strip() if cat_val else "Запчасть"),
            "brand": str(name_val).strip() if name_val else None,
            "partNumber": art_str,
            "store": str(store_val).strip() if store_val else None,
            "productUrl": None,
            "quantity": safe_float(qty_val, 1.0),
            "unitPrice": unit_price,
            "totalPrice": total_price,
            "status": status,
            "purchaseDate": purchase_date,
            "installedMileage": installed_km,
            "installedDate": installed_date,
            "serviceEventId": matched_se_id,
            "notes": None
        }
        parts.append(part_obj)

        # Строка 10: Летние шины Hankook Tire Ventus V12 evo2 K120 195/55 R15 85V
        if r_idx == 10:
            tire_set_from_row_10 = {
                "id": "tire-summer-hankook",
                "carId": car_id,
                "name": "Hankook Ventus V12 evo2 K120",
                "season": "summer",
                "dimension": "195/55 R15 85V",
                "manufactureYear": 2020,
                "recommendedMaxAgeYears": 6,
                "purchasePrice": 17300.0,
                "purchaseDate": format_date(d_val),
                "isMounted": True,
                "mountedAtMileage": 197288.0,
                "baseMileage": 32300.0,
                "isArchived": False,
                "notes": "Покупка комплекта 4 шт. в interrus-shina.ru"
            }

    # 6. Обработка листа «Разное» (49 строк)
    print("🧾 Обработка прочих расходов...")
    ws_misc = wb['Разное']
    misc_expenses = []
    osago_policy = None

    for r_idx in range(2, 51):
        row = ws_misc[r_idx]
        d_val = row[0].value
        name_val = row[1].value
        type_val = row[2].value
        cost_val = safe_float(row[3].value, 0.0)

        if not name_val and cost_val == 0.0:
            continue

        d_str = format_date(d_val)
        misc_id = f"misc-{r_idx - 1:03d}"

        misc_obj = {
            "id": misc_id,
            "carId": car_id,
            "date": d_str,
            "name": str(name_val).strip() if name_val else "Расход",
            "type": str(type_val).strip() if type_val else "Прочее",
            "cost": round(cost_val, 2),
            "notes": None
        }
        misc_expenses.append(misc_obj)

        # Выделение полиса ОСАГО (строка 28: 2021-07-06, 3294.65 ₽)
        if "осаго" in str(name_val).lower():
            start_d = datetime.date(2021, 7, 6)
            end_d = datetime.date(2022, 7, 5)
            osago_policy = {
                "id": "doc-osago-2021",
                "carId": car_id,
                "type": "osago",
                "company": "Тинькофф Страхование",
                "policyNumber": "ХХХ 0000000000",
                "startDate": start_d.strftime("%Y-%m-%d"),
                "endDate": end_d.strftime("%Y-%m-%d"),
                "cost": round(cost_val, 2),
                "isIncludedInExpenses": False,  # Уже учтён в miscExpenses для исключения двойного счёта
                "fileUrl": None,
                "notes": "Полис ОСАГО 2021-2022"
            }

    tire_sets = [tire_set_from_row_10] if tire_set_from_row_10 else []
    insurances = [osago_policy] if osago_policy else []

    # 7. Автомобиль Car
    car = {
        "id": car_id,
        "name": expected_car_name,
        "year": 2009,
        "plateNumber": "А000АА000",
        "vin": None,
        "status": "active",
        "purchaseDate": expected_purchase_date,
        "purchaseMileage": expected_purchase_mileage,
        "purchasePrice": expected_purchase_price,
        "selectionServiceCost": expected_selection_cost,
        "soldDate": None,
        "soldMileage": None,
        "soldPrice": None,
        "tankVolume": 60.0,
        "defaultFuelType": "95",
        "manualMileage": None,
        "currentMileage": expected_current_mileage,
        "notes": "Автомобиль куплен через подбор 05.07.2020",
        "extraPurchaseCosts": []
    }

    # 8. Настройки приложения
    app_settings = {
        "theme": "system",
        "monthlySalaryNet": expected_salary,
        "activeCarId": car_id,
        "maintenanceRemindKm": 1000,
        "maintenanceRemindDays": 30,
        "tireMaxAgeYears": 6,
        "lastBackupDate": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    # Сборка финального JSON-бэкапа
    backup_data = {
        "version": 1,
        "exportDate": datetime.datetime.now().isoformat(),
        "cars": [car],
        "refuelings": refuelings,
        "serviceEvents": service_events,
        "maintenanceRules": maintenance_rules,
        "parts": parts,
        "tireSets": tire_sets,
        "miscExpenses": misc_expenses,
        "insurances": insurances,
        "appSettings": app_settings
    }

    expected_counts = {
        "refuelings": 201,
        "serviceEvents": 27,
        "parts": 84,
        "maintenanceRules": 9,
        "miscExpenses": 49,
        "tireSets": 1,
        "insurances": 1,
    }
    for collection, expected_count in expected_counts.items():
        actual_count = len(backup_data[collection])
        if actual_count != expected_count:
            raise ValueError(
                f"{collection}: ожидалось {expected_count}, получено {actual_count}"
            )

    corrected_refueling = next(r for r in refuelings if r["mileage"] == 186355)
    assert corrected_refueling["date"] == "2025-05-01"
    assert all(r["fuelType"] == "95" for r in refuelings)
    assert refuelings[-1]["mileage"] == 203408 and not refuelings[-1]["isFullTank"]
    assert all(p["status"] == "wishlist" for p in parts if p["id"] >= "part-080")
    assert any(p["status"] == "in_stock" for p in parts)
    assert all(
        s["address"] == "г. Москва, ул. Примерная, д. 1"
        for s in service_events if "slok" in s["organization"].lower()
    )

    # Подсчёт сумм в результирующем датасете
    calc_fuel = sum(r["actualCost"] for r in refuelings)
    calc_parts = sum(p["totalPrice"] for p in parts if p["totalPrice"] is not None)
    calc_service = sum(s["totalLaborCost"] for s in service_events)
    calc_misc = sum(m["cost"] for m in misc_expenses)
    calc_maintenance = round(calc_fuel + calc_parts + calc_service + calc_misc, 2)
    calc_grand = round(calc_maintenance + car["purchasePrice"] + car["selectionServiceCost"], 2)
    max_mileage = max(
        car["purchaseMileage"],
        max((r["mileage"] for r in refuelings), default=0),
        max((s["mileage"] for s in service_events if s["mileage"]), default=0),
        max((p["installedMileage"] for p in parts if p["installedMileage"]), default=0)
    )

    print("\n" + "=" * 65)
    print("🎯 ОТЧЁТ О СВЕРКЕ КОНТРОЛЬНЫХ СУММ С ЛИСТОМ «ОБЩЕЕ»:")
    print("=" * 65)
    print(f"{'Показатель':<28} | {'Эталон (Excel)':<15} | {'Итог скрипта':<15} | {'Статус'}")
    print("-" * 65)

    checks = [
        ("Стоимость бензина", expected_fuel_cost, calc_fuel),
        ("Стоимость запчастей", expected_parts_cost, calc_parts),
        ("Стоимость сервиса", expected_service_cost, calc_service),
        ("Прочие траты", expected_misc_cost, calc_misc),
        ("Всего на содержание", expected_total_maint, calc_maintenance),
        ("Всего с покупкой", expected_grand_total, calc_grand),
        ("Текущий пробег, км", float(expected_current_mileage), float(max_mileage))
    ]

    all_matched = True
    for label, exp, act in checks:
        diff = abs(exp - act)
        status = "✅ СОВПАЛО" if diff < 0.01 else f"❌ РАСХОЖДЕНИЕ ({diff:.2f})"
        if diff >= 0.01:
            all_matched = False
        print(f"{label:<28} | {exp:>12.2f} ₽ | {act:>12.2f} ₽ | {status}")

    print("=" * 65)

    if not all_matched:
        print("❌ ОШИБКА: Контрольные суммы не сошлись! Файл бэкапа не сохранён.")
        sys.exit(1)

    print(f"✅ УСПЕШНО: Все суммы сошлись копейка в копейку!")
    print(f"📦 Сохранение бэкапа в: {OUTPUT_JSON_PATH} ...")

    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)

    file_size_kb = OUTPUT_JSON_PATH.stat().st_size / 1024
    print(f"🎉 Готово! Файл {OUTPUT_JSON_PATH.name} успешно создан ({file_size_kb:.1f} КБ).")


if __name__ == "__main__":
    run_conversion()
