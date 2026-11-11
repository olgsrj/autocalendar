#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/generate_pwa_icons.py
Генератор валидных PNG-иконок PWA (192x192 и 512x512) для PWA WebAPK на Android.
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)


def draw_car_icon(size):
    # Создаём изображение с альфа-каналом
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Рисуем скругленный фон в фирменном градиенте (синий/индиго)
    margin = size * 0.04
    radius = size * 0.22
    bg_box = [margin, margin, size - margin, size - margin]

    # Градиентная имитация или глубокий солидный синий с акцентом
    bg_color = (37, 99, 235, 255)  # Tailwind blue-600 #2563eb
    draw.rounded_rectangle(bg_box, radius=radius, fill=bg_color)

    # Внутренний акцентный контур
    accent_box = [margin + size * 0.015, margin + size * 0.015, size - margin - size * 0.015, size - margin - size * 0.015]
    draw.rounded_rectangle(accent_box, radius=radius * 0.9, outline=(96, 165, 250, 180), width=max(1, int(size * 0.015)))

    # Рисуем стилизованный силуэт автомобиля (белый с аккуратными деталями)
    # Координаты силуэта автомобиля пропорционально размеру
    s = size / 100.0

    # Корпус автомобиля
    # Крыша
    roof_pts = [
        (30 * s, 48 * s),
        (38 * s, 34 * s),
        (64 * s, 34 * s),
        (74 * s, 48 * s)
    ]
    draw.polygon(roof_pts, fill=(255, 255, 255, 240))

    # Лобовое, боковое и заднее стекла (темный салон)
    win_pts = [
        (33 * s, 46 * s),
        (39 * s, 36 * s),
        (62 * s, 36 * s),
        (71 * s, 46 * s)
    ]
    draw.polygon(win_pts, fill=(29, 78, 216, 255))
    # Стойка окна
    draw.line([(51 * s, 36 * s), (51 * s, 46 * s)], fill=(255, 255, 255, 240), width=max(1, int(2.5 * s)))

    # Основной кузов
    body_pts = [
        (18 * s, 54 * s),
        (22 * s, 48 * s),
        (80 * s, 48 * s),
        (86 * s, 54 * s),
        (88 * s, 64 * s),
        (16 * s, 64 * s)
    ]
    draw.polygon(body_pts, fill=(255, 255, 255, 255))

    # Фары передние и задние
    draw.rounded_rectangle([82 * s, 53 * s, 87 * s, 58 * s], radius=2 * s, fill=(251, 191, 36, 255)) # amber light
    draw.rounded_rectangle([17 * s, 53 * s, 21 * s, 58 * s], radius=2 * s, fill=(239, 68, 68, 255)) # red rear

    # Колеса
    # Заднее
    draw.ellipse([25 * s, 58 * s, 39 * s, 72 * s], fill=(30, 41, 59, 255))
    draw.ellipse([28.5 * s, 61.5 * s, 35.5 * s, 68.5 * s], fill=(203, 213, 225, 255))
    draw.ellipse([30.5 * s, 63.5 * s, 33.5 * s, 66.5 * s], fill=(30, 41, 59, 255))

    # Переднее
    draw.ellipse([65 * s, 58 * s, 79 * s, 72 * s], fill=(30, 41, 59, 255))
    draw.ellipse([68.5 * s, 61.5 * s, 75.5 * s, 68.5 * s], fill=(203, 213, 225, 255))
    draw.ellipse([70.5 * s, 63.5 * s, 73.5 * s, 66.5 * s], fill=(30, 41, 59, 255))

    # Символ календаря (маленькая плашка вверху справа)
    cal_box = [62 * s, 18 * s, 80 * s, 34 * s]
    draw.rounded_rectangle(cal_box, radius=3 * s, fill=(248, 250, 252, 255))
    draw.rounded_rectangle([62 * s, 18 * s, 80 * s, 23 * s], radius=2 * s, fill=(239, 68, 68, 255))
    # Ушки календаря
    draw.line([(66 * s, 16 * s), (66 * s, 19 * s)], fill=(100, 116, 139, 255), width=max(1, int(1.8 * s)))
    draw.line([(76 * s, 16 * s), (76 * s, 19 * s)], fill=(100, 116, 139, 255), width=max(1, int(1.8 * s)))
    # Точки чисел в календаре
    draw.ellipse([65 * s, 26 * s, 67 * s, 28 * s], fill=(59, 130, 246, 255))
    draw.ellipse([70 * s, 26 * s, 72 * s, 28 * s], fill=(59, 130, 246, 255))
    draw.ellipse([75 * s, 26 * s, 77 * s, 28 * s], fill=(59, 130, 246, 255))
    draw.ellipse([65 * s, 30 * s, 67 * s, 32 * s], fill=(59, 130, 246, 255))
    draw.ellipse([70 * s, 30 * s, 72 * s, 32 * s], fill=(59, 130, 246, 255))

    return img


def main():
    print("🎨 Генерация PWA иконок...")
    for size in (192, 512):
        icon = draw_car_icon(size)
        out_path = PUBLIC_DIR / f"pwa-{size}x{size}.png"
        icon.save(str(out_path), "PNG")
        print(f"  ✓ Создана иконка: {out_path} ({size}x{size})")

    # Создадим также favicon.png
    fav = draw_car_icon(64)
    fav.save(str(PUBLIC_DIR / "favicon.png"), "PNG")
    print(f"  ✓ Создана иконка: {PUBLIC_DIR / 'favicon.png'} (64x64)")


if __name__ == "__main__":
    main()
