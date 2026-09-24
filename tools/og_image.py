"""Luo docs/og-image.png: esikatselukuva, joka näkyy kun linkki jaetaan
WhatsAppissa, Facebookissa, Slackissa jne.

Aja repon juuresta:  python tools/og_image.py

Koko 1200x630 on Facebookin/LinkedInin suosittelema 1.91:1-kuvasuhde.
Kuva piirretään kaksinkertaisena ja pienennetään lopuksi, jolloin
pyöristetyt kulmat ja teksti reunanpehmentyvät siististi.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "og-image.png"
ICON = ROOT / "docs" / "icons" / "icon-192.png"
FONTS = Path("C:/Windows/Fonts")

W, H = 1200, 630
S = 2  # supersampling-kerroin

# Samat värit kuin sovelluksen tummassa tilassa (index.html:n html.dark-säännöt)
BG = "#0f172a"
PANEL = "#0b1220"
PANEL_BORDER = "#1f2937"
WHITE = "#f1f5f9"
MUTED = "#94a3b8"
SUB = "#cbd5e1"
GREEN = ("#052e16", "#166534", "#4ade80")  # tausta, reuna, teksti
AMBER = ("#3b2f1a", "#7c5a2b", "#f8c27a")

# Esimerkkipäivä: kallis ilta, halpa yö (snt/kWh)
EXAMPLE_PRICES = [17, 18, 16, 18, 20, 22, 18, 12, 7, 4.5, 4, 3.9, 4.2, 4.3, 5, 6.5, 8, 10, 13, 16, 15]


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size * S)


def s(*values):
    """Skaalaa koordinaatit supersampling-kertoimella."""
    return [v * S for v in values]


def bar_color(price):
    # Sama väriasteikko kuin sovelluksen priceColor()
    if price < 5:
        return "#22c55e"
    if price < 10:
        return "#eab308"
    if price < 15:
        return "#f97316"
    return "#ef4444"


def wrap(draw, text, fnt, max_width):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=fnt) <= max_width * S:
            line = test
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def device_row(draw, y, colors, name, verdict, detail):
    bg, border, text = colors
    draw.rounded_rectangle(s(700, y, 1128, y + 92), radius=18 * S, fill=bg, outline=border, width=2 * S)
    draw.text(s(726, y + 16), name, font=font("seguisb.ttf", 22), fill=SUB)
    draw.text(s(726, y + 46), verdict, font=font("segoeuib.ttf", 28), fill=text)
    right = font("seguisb.ttf", 24)
    draw.text(s(1104 - draw.textlength(detail, font=right) / S, y + 50), detail, font=right, fill=text)


def main():
    img = Image.new("RGB", s(W, H), BG)
    draw = ImageDraw.Draw(img)

    # --- Vasen palsta: viesti ---
    icon = Image.open(ICON).convert("RGBA").resize(s(64, 64), Image.LANCZOS)
    img.paste(icon, s(72, 72), icon)
    draw.text(s(152, 88), "porssisahkosaasto.com", font=font("seguisb.ttf", 26), fill=MUTED)

    draw.text(s(72, 180), "Kannattaako", font=font("segoeuib.ttf", 76), fill=WHITE)
    draw.text(s(72, 266), "nyt?", font=font("segoeuib.ttf", 76), fill=WHITE)

    sub_font = font("segoeui.ttf", 30)
    y = 402
    for line in wrap(draw, "Näe sähkön halvin tunti ja paljonko säästät odottamalla.", sub_font, 540):
        draw.text(s(72, y), line, font=sub_font, fill=SUB)
        y += 42

    pill_font = font("seguisb.ttf", 22)
    pill = "Ilmainen  ·  Ei rekisteröitymistä"
    pill_w = draw.textlength(pill, font=pill_font) / S + 40
    draw.rounded_rectangle(s(72, 516, 72 + pill_w, 562), radius=23 * S, fill=GREEN[0], outline=GREEN[1], width=2 * S)
    draw.text(s(92, 524), pill, font=pill_font, fill=GREEN[2])

    # --- Oikea palsta: sovelluksen näköinen kortti ---
    draw.rounded_rectangle(s(672, 60, 1156, 570), radius=28 * S, fill=PANEL, outline=PANEL_BORDER, width=2 * S)
    draw.text(s(700, 84), "Sähkön hinta nyt", font=font("segoeui.ttf", 22), fill=MUTED)
    draw.text(s(700, 110), "18.40", font=font("segoeuib.ttf", 56), fill="#f87171")
    draw.text(s(870, 140), "snt/kWh", font=font("segoeui.ttf", 22), fill=MUTED)

    # Pylväskaavio
    base_y, max_h, left, width = 322, 110, 700, 428
    gap = 4
    bar_w = (width - gap * (len(EXAMPLE_PRICES) - 1)) / len(EXAMPLE_PRICES)
    top = max(EXAMPLE_PRICES)
    for i, p in enumerate(EXAMPLE_PRICES):
        x0 = left + i * (bar_w + gap)
        h = max(6, p / top * max_h)
        draw.rounded_rectangle(s(x0, base_y - h, x0 + bar_w, base_y), radius=3 * S, fill=bar_color(p))

    device_row(draw, 350, AMBER, "Sauna (1 h)", "Odota klo 00.30", "säästät 0,65 €")
    device_row(draw, 456, GREEN, "Halvin tunti", "klo 00.30–01.30", "3.92 snt")

    img.resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
    print(f"Tallennettu {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} kt)")


if __name__ == "__main__":
    main()
