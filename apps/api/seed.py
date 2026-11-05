"""Données de démonstration. Idempotent : ne fait rien si des produits existent déjà.
Les images sont des visuels de substitution générés (SVG) — à remplacer par de vraies photos via l'admin.
Usage: python seed.py            (uniquement le produit réel)
       python seed.py --demo     (ajoute des produits de démonstration inventés)"""
import shutil
from decimal import Decimal
from pathlib import Path

from app.db import Base, SessionLocal, engine
from app.enums import PricingUnit
from app.models import Category, Product, ProductImage
from app.settings_store import set_setting
from app.storage import PUBLIC

PALETTES = {
    "sand": ("#EEEAE1", "#DDD6C8", "#A69A89", "#29251F"),
    "olive": ("#D9DCCB", "#B5BBA0", "#737A61", "#29251F"),
    "ivory": ("#F3EFE6", "#E6DFD0", "#C9BDA8", "#555C45"),
    "espresso": ("#3A342B", "#29251F", "#A69A89", "#F8F6F1"),
}


def frame(bg1, bg2, inner, w=1200, h=1500):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">'
            f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg1}"/>'
            f'<stop offset="1" stop-color="{bg2}"/></linearGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#g)"/>{inner}</svg>')


def ground(c, y=1180):
    return f'<ellipse cx="600" cy="{y}" rx="420" ry="26" fill="{c}" opacity=".22"/>'


def umbrella(p, tilt=0):
    a, b, c, ink = PALETTES[p]
    return frame(a, b, f'''{ground(ink)}<g transform="rotate({tilt} 600 1180)">
<rect x="594" y="520" width="12" height="660" fill="{ink}" opacity=".85"/>
<path d="M120 560 Q600 120 1080 560 Q840 500 600 560 Q360 500 120 560Z" fill="{c}"/>
<path d="M600 560 Q520 330 330 470 M600 560 Q680 330 870 470" stroke="{a}" stroke-width="3" fill="none" opacity=".6"/>
<rect x="470" y="1150" width="260" height="30" fill="{ink}" opacity=".8"/></g>''')


def table(p, round_=True):
    a, b, c, ink = PALETTES[p]
    top = (f'<ellipse cx="600" cy="760" rx="440" ry="90" fill="{c}"/>' if round_
           else f'<path d="M180 740 L1020 740 L1100 800 L100 800Z" fill="{c}"/>')
    return frame(a, b, f'''{ground(ink)}{top}
<rect x="585" y="800" width="30" height="360" fill="{ink}" opacity=".85"/>
<rect x="440" y="1150" width="320" height="26" fill="{ink}" opacity=".85"/>''')


def chair(p):
    a, b, c, ink = PALETTES[p]
    return frame(a, b, f'''{ground(ink)}
<path d="M420 560 H780 V780 H420Z" fill="{c}"/><rect x="400" y="780" width="400" height="44" fill="{c}"/>
<g stroke="{ink}" stroke-width="22" stroke-linecap="round"><line x1="430" y1="824" x2="400" y2="1160"/>
<line x1="770" y1="824" x2="800" y2="1160"/><line x1="430" y1="520" x2="430" y2="824"/><line x1="770" y1="520" x2="770" y2="824"/></g>''')


def arch(p):
    a, b, c, ink = PALETTES[p]
    leaves = "".join(f'<circle cx="{300+i*45}" cy="{520-int(((i-8)**2)*-2.2+0)}" r="{18+i%3*6}" fill="{c}" opacity=".85"/>'
                     for i in range(0, 17))
    return frame(a, b, f'''{ground(ink)}<path d="M300 1170 V620 A300 300 0 0 1 900 620 V1170" fill="none" stroke="{ink}" stroke-width="20"/>
{leaves}''')


def lanterns(p):
    a, b, c, ink = PALETTES[p]
    out = [ground(ink)]
    for x, y, s in ((330, 560, 1.1), (600, 760, 1.4), (870, 620, 1.0)):
        out.append(f'<g transform="translate({x} {y}) scale({s})"><line x1="0" y1="-300" x2="0" y2="-70" stroke="{ink}" stroke-width="4"/>'
                   f'<rect x="-60" y="-70" width="120" height="170" rx="6" fill="{c}" opacity=".9"/>'
                   f'<rect x="-40" y="-40" width="80" height="110" fill="{a}" opacity=".55"/></g>')
    return frame(a, b, "".join(out))


def backdrop(p):
    a, b, c, ink = PALETTES[p]
    folds = "".join(f'<path d="M{200+i*100} 360 Q{230+i*100} 760 {200+i*100} 1160" stroke="{ink}" opacity=".12" stroke-width="10" fill="none"/>' for i in range(9))
    return frame(a, b, f'''{ground(ink)}<rect x="170" y="330" width="860" height="850" fill="{c}" opacity=".9"/>{folds}
<rect x="150" y="310" width="900" height="26" fill="{ink}" opacity=".8"/>''')


def hero(p="olive"):
    a, b, c, ink = PALETTES[p]
    return frame(a, b, f'''<circle cx="900" cy="330" r="150" fill="#fff" opacity=".35"/>
<rect y="1050" width="1200" height="450" fill="{c}" opacity=".35"/>
<g transform="translate(120 0)"><rect x="474" y="440" width="12" height="640" fill="{ink}" opacity=".85"/>
<path d="M40 470 Q480 60 920 470 Q700 420 480 470 Q260 420 40 470Z" fill="{c}"/></g>
<g transform="translate(-60 160) scale(.85)"><rect x="474" y="440" width="12" height="640" fill="{ink}" opacity=".6"/>
<path d="M40 470 Q480 60 920 470 Q700 420 480 470 Q260 420 40 470Z" fill="{a}" opacity=".9"/></g>''')


MAKERS = {"umbrella": umbrella, "table": table, "chair": chair, "arch": arch, "lanterns": lanterns, "backdrop": backdrop}

CATEGORIES = ["Outdoor Umbrellas", "Tables", "Chairs", "Event Decor", "Decorative Accessories", "Other Equipment"]

# name, category, kind, palettes, price, unit, deposit, qty, description, specs, conditions
PRODUCTS = [
    # Produit réel (photo fournie par le propriétaire). Prix, caution et stock : valeurs de départ à ajuster dans l'admin.
    ("Fringed Umbrella", "Outdoor Umbrellas", "photo:fringed-umbrella.jpg", ("sand",), "40", PricingUnit.DAY, "25", 6,
     "A white cotton umbrella with a soft fringe and a natural wood frame. It shades the whole table and turns an ordinary yard into a place people want to linger.",
     {"Canopy": "White cotton canvas with fringe", "Frame": "Natural wood", "Use": "Outdoor dining and lounge areas"},
     "Not for use in strong wind. Close the canopy when unattended."),
    ("Round Banquet Table, 60 in", "Tables", "table", ("ivory", "sand"), "18", PricingUnit.DAY, "0", 20,
     "Seats eight to ten comfortably. Sturdy folding legs, easy to dress with linens.",
     {"Diameter": "60 in / 152 cm", "Seats": "8 to 10", "Material": "Moulded top, steel frame"}, "Linens not included."),
    ("Farmhouse Trestle Table", "Tables", "table", ("sand", "olive"), "55", PricingUnit.DAY, "30", 4,
     "A long, solid table for family-style dinners. Warm wood tone with visible grain.",
     {"Length": "8 ft / 2.4 m", "Seats": "8", "Material": "Solid pine, matte finish"}, "Place on level ground. Use placemats for hot dishes."),
    ("Natural Cross-Back Chair", "Chairs", "chair", ("sand", "ivory"), "6", PricingUnit.DAY, "0", 60,
     "A light, stackable chair with a woven seat. Pairs with both rustic and modern tables.",
     {"Seat height": "18 in", "Material": "Beech wood, woven seat", "Stackable": "Yes, up to 6"}, "Wipe clean after use."),
    ("Floral Wedding Arch", "Event Decor", "arch", ("olive", "ivory"), "120", PricingUnit.WEEKEND, "75", 3,
     "A round-topped arch for ceremonies and photo moments, ready to be dressed with florals or fabric.",
     {"Height": "8 ft / 2.4 m", "Width": "6 ft / 1.8 m", "Material": "Powder-coated steel"}, "Anchoring required outdoors."),
    ("Draped Backdrop Stand", "Event Decor", "backdrop", ("ivory", "sand"), "85", PricingUnit.WEEKEND, "50", 4,
     "Adjustable stand with soft linen drape. A calm backdrop for dessert tables and portraits.",
     {"Width": "10 ft adjustable", "Height": "6 to 9 ft", "Drape": "Ivory linen blend"}, "Drape returned laundered or cleaning fee applies."),
    ("Brass Lantern Set (3)", "Decorative Accessories", "lanterns", ("espresso", "sand"), "22", PricingUnit.DAY, "15", 12,
     "Three lanterns in graduated sizes for tables, aisles and steps. Battery candles included.",
     {"Set": "3 lanterns", "Heights": "8, 12, 16 in", "Light": "LED candles included"}, "Return with batteries intact."),
]


def run(demo: bool = False):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.query(Product).count():
            print("Already seeded.")
            return
        selected = [x for x in PRODUCTS if demo or x[2].startswith("photo:")]
        cats = {}
        for i, n in enumerate(CATEGORIES):
            c = Category(name=n, slug=n.lower().replace(" ", "-"), sort_order=i)
            db.add(c)
            cats[n] = c
        for name, cat, kind, pals, price, unit, dep, qty, desc, specs, cond in selected:
            slug = name.lower().replace(",", "").replace("(", "").replace(")", "").replace(" ", "-")
            p = Product(name=name, slug=slug, category=cats[cat], description=desc, specifications=specs,
                        rental_conditions=cond, unit_price=Decimal(price), pricing_unit=unit,
                        security_deposit=Decimal(dep), total_quantity=qty)
            db.add(p)
            if kind.startswith("photo:"):
                fname = kind.split(":", 1)[1]
                shutil.copyfile(Path(__file__).parent / "seed_assets" / fname, PUBLIC / fname)
                p.images.append(ProductImage(url=f"/media/{fname}", sort_order=0,
                                             alt="Fringed white umbrellas over a long table set for a garden party"))
                continue
            for n, pal in enumerate(pals):
                key = f"seed-{slug}-{n}.svg"
                (PUBLIC / key).write_text(MAKERS[kind](pal))
                p.images.append(ProductImage(url=f"/media/{key}", alt=name, sort_order=n))
        for k, v in {"whatsapp_number": "15555550123", "contact_email": "hello@example.com",
                     "business_address": "Houston, TX & surrounding areas", "delivery_enabled": True, "delivery_fee": "0.00",
                     "payment_methods": ["Zelle", "Cash App", "Bank transfer", "Cash"],
                     "payment_instructions": "Send your deposit to the account provided, then submit the payment details here."}.items():
            set_setting(db, k, v)
        db.commit()
        print("Seeded", len(selected), "products (demo WhatsApp number set — change it in Settings).")


if __name__ == "__main__":
    import sys
    run(demo="--demo" in sys.argv)
