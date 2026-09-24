"""Generoi opassivut (säästövinkit) docs/-kansioon yhtenäisellä pohjalla.

Aja repon juuresta:  python tools/guides.py
Muokkaa tekstejä tässä tiedostossa, älä suoraan HTML-tiedostoissa, muuten
seuraava ajo kirjoittaa muutokset yli. Aja lopuksi npm run build:css.
"""
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

DOCS = Path(__file__).resolve().parent.parent / "docs"
SITE = "https://porssisahkosaasto.com"
DATE = "2026-09-24"

GUIDES = [
    ("porssisahko-huomenna.html", "Pörssisähkön hinta huomenna – milloin hinnat julkaistaan?"),
    ("milloin-kannattaa-pesta-pyykit.html", "Milloin kannattaa pestä pyykit pörssisähköllä?"),
    ("sahkoauton-lataus-halvin-aika.html", "Sähköauton lataus pörssisähköllä – halvin aika ladata"),
    ("saunan-lammitys-hinta.html", "Paljonko saunan lämmitys maksaa pörssisähköllä?"),
]

CTA = """
    <div class="mt-8 rounded-2xl bg-white shadow p-4 sm:p-6 text-center">
      <p class="text-sm text-slate-600">Katso tämän hetken hinta, halvin tunti ja paljonko säästät.</p>
      <a href="/" class="mt-3 inline-block rounded-xl bg-emerald-700 text-white px-5 py-3 text-sm font-medium hover:bg-emerald-800">Avaa säästölaskuri →</a>
    </div>"""


FEED_ITEMS = []  # (tiedosto, otsikko, kuvaus) RSS-syötettä varten


def page(filename, title, description, h1, body, crumbs, is_article=True):
    url = f"{SITE}/{filename}"
    if is_article:
        FEED_ITEMS.append((filename, h1, description))
    ld = [{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": f"{SITE}/{href}"}
            for i, (name, href) in enumerate(crumbs)
        ],
    }]
    if is_article:
        ld.append({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": h1,
            "description": description,
            "inLanguage": "fi",
            "datePublished": DATE,
            "dateModified": DATE,
            "image": f"{SITE}/og-image.png",
            "mainEntityOfPage": url,
            "publisher": {"@type": "Organization", "name": "Pörssisähkö-säästölaskuri", "url": f"{SITE}/"},
        })
    others = [(f, t) for f, t in GUIDES if f != filename]
    related = "\n".join(
        f'        <li><a class="underline hover:no-underline" href="./{f}">{t}</a></li>' for f, t in others
    )
    related_block = "" if not is_article else f"""
    <section class="mt-8">
      <h2 class="text-base font-semibold">Lue myös</h2>
      <ul class="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
{related}
      </ul>
    </section>"""
    return f"""<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#1e293b" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="{url}" />
  <link rel="icon" href="./icons/icon-192.png" />
  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
  <meta property="og:title" content="{h1}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{url}" />
  <meta property="og:locale" content="fi_FI" />
  <meta property="og:site_name" content="Pörssisähkö-säästölaskuri" />
  <meta property="og:image" content="{SITE}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="alternate" type="application/rss+xml" title="Pörssisähkö-säästölaskuri: säästövinkit" href="{SITE}/feed.xml" />
  <link rel="stylesheet" href="./styles.css" />
  <script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=2)}
  </script>
</head>
<body class="bg-slate-50 text-slate-900">
  <main class="w-full mx-auto px-4 sm:px-6 py-6 max-w-3xl">
    <nav class="text-sm text-slate-600" aria-label="Murupolku">
      <a class="underline hover:no-underline" href="/">Säästölaskuri</a>
      {'<span aria-hidden="true"> › </span><a class="underline hover:no-underline" href="./saastovinkit.html">Säästövinkit</a>' if is_article else ''}
    </nav>

    <article class="mt-4 bg-white rounded-2xl shadow p-4 sm:p-6 text-slate-700 leading-relaxed">
      <h1 class="text-2xl sm:text-3xl font-bold text-slate-900">{h1}</h1>
{body}
    </article>
{CTA}
{related_block}

    <footer class="mt-10 pb-10 text-xs text-slate-500 flex gap-3 justify-center">
      <a class="underline hover:no-underline" href="/">Laskuri</a>
      <a class="underline hover:no-underline" href="./saastovinkit.html">Säästövinkit</a>
      <a class="underline hover:no-underline" href="./privacy.html">Tietosuoja</a>
      <a class="underline hover:no-underline" href="./cookies.html">Evästeet</a>
    </footer>
  </main>
</body>
</html>
"""


H2 = 'class="mt-6 text-lg font-semibold text-slate-900"'
P = 'class="mt-2"'
UL = 'class="mt-2 list-disc pl-5 space-y-1"'
NOTE = 'class="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700"'
TABLE = 'class="mt-3 w-full text-sm"'
TH = 'class="text-left border-b py-1 pr-2"'
TD = 'class="border-b py-1 pr-2"'


def table(headers, rows):
    head = "".join(f"<th {TH}>{h}</th>" for h in headers)
    body = "\n".join(
        "          <tr>" + "".join(f"<td {TD}>{c}</td>" for c in r) + "</tr>" for r in rows
    )
    return f"""      <table {TABLE}>
        <thead><tr>{head}</tr></thead>
        <tbody>
{body}
        </tbody>
      </table>"""


pages = {}

pages["porssisahko-huomenna.html"] = page(
    "porssisahko-huomenna.html",
    "Pörssisähkö huomenna – milloin huomisen hinnat julkaistaan?",
    "Huomisen pörssisähkön hinnat julkaistaan yleensä noin klo 14. Katso miten hinnat muodostuvat, miksi ne vaihtelevat ja miten hyödynnät huomisen halvimmat tunnit.",
    "Pörssisähkön hinta huomenna – milloin hinnat julkaistaan?",
    f"""
      <p {P}>Huomisen pörssisähkön hinnat selviävät <strong>yleensä noin kello 14 Suomen aikaa</strong>.
      Siitä eteenpäin näet koko seuraavan vuorokauden hinnat ja voit suunnitella, milloin pyykit pestään,
      sauna lämmitetään tai sähköauto ladataan.</p>

      <h2 {H2}>Miten huomisen hinta muodostuu?</h2>
      <p {P}>Suomen pörssisähkön hinta määräytyy pohjoismaisessa Nord Pool -sähköpörssissä. Sähkön myyjät ja
      ostajat jättävät tarjouksensa seuraavan päivän jokaiselle jaksolle keskipäivään mennessä, ja pörssi laskee
      niistä hinnan, jolla kysyntä ja tarjonta kohtaavat. Tulokset julkaistaan iltapäivällä, minkä jälkeen ne
      näkyvät myös tässä laskurissa.</p>
      <p {P}>Lokakuusta 2025 alkaen hinta on määräytynyt <strong>15 minuutin jaksoissa</strong> aiemman tunnin
      sijaan. Siksi saman tunnin sisällä hinta voi vaihdella, ja halvin hetki voi alkaa esimerkiksi klo 02.15.
      Laskuri etsii halvimman jakson vartin tarkkuudella.</p>

      <h2 {H2}>Miksi hinta vaihtelee niin paljon?</h2>
      <ul {UL}>
        <li><strong>Tuulivoima:</strong> tuulisena päivänä sähköä on tarjolla paljon ja hinta laskee, joskus jopa negatiiviseksi.</li>
        <li><strong>Kulutus:</strong> arkiaamuina ja -iltoina kulutus on suurinta ja hinta korkeimmillaan. Yöllä ja viikonloppuisin sähkö on yleensä halvempaa.</li>
        <li><strong>Voimalaitosten huollot:</strong> kun iso ydinvoimala tai siirtoyhteys on huollossa, hinta voi nousta selvästi.</li>
        <li><strong>Sää ja vuodenaika:</strong> pakkasjaksoina lämmitys lisää kulutusta, ja hinnat ovat talvella yleensä korkeampia.</li>
      </ul>

      <h2 {H2}>Negatiivinen sähkön hinta</h2>
      <p {P}>Kun tuulta on paljon ja kulutusta vähän, pörssihinta voi painua nollan alle. Pörssisähkösopimuksella
      maksat silti yleensä sähköyhtiösi marginaalin sekä verkkoyhtiön siirtomaksun ja sähköveron, mutta itse
      energia on silloin käytännössä ilmaista. Nämä ovat parhaita hetkiä ajastettaville laitteille.</p>

      <h2 {H2}>Näin hyödynnät huomisen hinnat</h2>
      <ol class="mt-2 list-decimal pl-5 space-y-1">
        <li>Avaa laskuri kello 14 jälkeen ja katso kaaviosta huomisen halvimmat jaksot.</li>
        <li>Valitse <em>Tarkempi laskenta → Etsi halvin aika</em>, kerro kesto ja milloin laitteen pitää olla valmis.</li>
        <li>Aseta laitteen ajastin laskurin ehdottamaan aikaan.</li>
      </ol>

      <p {NOTE}>Laskurin hinnat ovat pörssihintoja, jotka sisältävät oletuksena arvonlisäveron 25,5 %. Voit
      vaihtaa näkymän verottomaksi hinnan alla olevasta ALV-valinnasta. Oma sähkölaskusi sisältää lisäksi
      sähköyhtiösi marginaalin ja perusmaksun sekä verkkoyhtiön siirtomaksut ja sähköveron.</p>""",
    [("Säästölaskuri", ""), ("Säästövinkit", "saastovinkit.html"), ("Pörssisähkö huomenna", "porssisahko-huomenna.html")],
)

pages["milloin-kannattaa-pesta-pyykit.html"] = page(
    "milloin-kannattaa-pesta-pyykit.html",
    "Milloin kannattaa pestä pyykit? Halvin aika pörssisähköllä",
    "Pyykinpesu, kuivausrumpu ja astianpesukone ovat helpoimpia tapoja säästää pörssisähköllä. Katso paljonko ne kuluttavat ja miten löydät halvimman ajan.",
    "Milloin kannattaa pestä pyykit pörssisähköllä?",
    f"""
      <p {P}>Pyykinpesukone, kuivausrumpu ja astianpesukone ovat kodin helpoimmin ajastettavia laitteita. Niiden
      ajankohdalla ei yleensä ole väliä, kunhan työ on valmis ajoissa. Kun ne käynnistetään päivän halvimpaan
      aikaan, säästö kertyy joka viikko ilman vaivaa.</p>

      <h2 {H2}>Paljonko laitteet kuluttavat?</h2>
{table(["Laite", "Kulutus / kerta"], [
    ["Pyykinpesukone", "0,2–2,5 kWh (40 °C noin 0,5–1 kWh)"],
    ["Kuivausrumpu", "2–6 kWh"],
    ["Astianpesukone", "0,6–1,6 kWh"],
])}
      <p {P}>Kuivausrumpu on näistä ylivoimaisesti suurin kuluttaja, joten sen ajoittamisesta hyötyy eniten.</p>

      <h2 {H2}>Esimerkki: paljonko säästää?</h2>
      <p {P}>Kuivausrumpu kuluttaa 4 kWh. Jos sähkö maksaa illalla 20 snt/kWh ja yöllä 3 snt/kWh, kuivaus maksaa
      illalla 0,80 € ja yöllä 0,12 €. Säästö on 0,68 € kerralta. Kolme kuivausta viikossa tekee noin
      <strong>100 € vuodessa</strong> pelkästä ajoituksesta.</p>

      <h2 {H2}>Milloin sähkö on halvinta?</h2>
      <p {P}>Useimmiten yöllä ja varhain aamulla sekä viikonloppuisin, jolloin kulutus on pientä. Tuulisina päivinä
      halpoja jaksoja voi olla myös keskellä päivää. Koska hinnat vaihtelevat päivittäin, kannattaa tarkistaa
      päivän tilanne laskurista: <em>Kannattaako nyt?</em> -kortit kertovat suoraan, käynnistätkö nyt vai
      odotatko, ja paljonko odottaminen säästää.</p>

      <h2 {H2}>Käytä laitteen ajastinta</h2>
      <p {P}>Lähes kaikissa pesukoneissa ja astianpesukoneissa on viiveajastin. Jos laskuri ehdottaa
      käynnistystä klo 02.15, aseta ajastin niin, että kone käynnistyy silloin. Osassa koneista ajastin
      asetetaan valmistumisajan mukaan. Käytä silloin laskurin <em>Valmis viimeistään</em> -valintaa.</p>

      <p {NOTE}><strong>Turvallisuus:</strong> Tukes suosittelee, ettei pesukoneita, astianpesukoneita tai
      kuivausrumpua jätetä käymään, kun kukaan ei ole kotona tai kaikki nukkuvat. Vesivuoto tai laitevika on
      silloin vaikeampi huomata. Jos ajastat koneen yölle, varmista vesiliitännät ja harkitse vuotokaukaloa tai
      vesivuotovahtia.</p>""",
    [("Säästölaskuri", ""), ("Säästövinkit", "saastovinkit.html"), ("Pyykinpesu", "milloin-kannattaa-pesta-pyykit.html")],
)

pages["sahkoauton-lataus-halvin-aika.html"] = page(
    "sahkoauton-lataus-halvin-aika.html",
    "Sähköauton lataus pörssisähköllä – halvin aika ladata",
    "Sähköauton lataus on kodin suurimpia ajastettavia kuormia. Katso paljonko ajoitus säästää ja miten löydät pörssisähkön halvimmat tunnit lataukselle.",
    "Sähköauton lataus pörssisähköllä – halvin aika ladata",
    f"""
      <p {P}>Sähköauto on kodin suurimpia yksittäisiä sähkönkuluttajia, mutta samalla helpoimpia ajoittaa: auto
      seisoo yleensä pihassa koko yön, ja lataus ehtii hyvin valmiiksi aamuun mennessä. Pörssisähköllä
      latausajankohta vaikuttaa kustannuksiin enemmän kuin minkään muun laitteen kohdalla.</p>

      <h2 {H2}>Paljonko lataus maksaa?</h2>
      <p {P}>Sähköauto kuluttaa tyypillisesti 15–20 kWh sadalla kilometrillä. 30 kWh:n lataus maksaa:</p>
{table(["Pörssihinta", "30 kWh:n lataus"], [
    ["3 snt/kWh (halpa yö)", "0,90 €"],
    ["10 snt/kWh", "3,00 €"],
    ["20 snt/kWh (kallis ilta)", "6,00 €"],
])}
      <p {P}>Jos ajat 1 500 km kuukaudessa, kulutat noin 270 kWh. Jos lataat keskimäärin 10 snt/kWh halvemmalla
      kuin ilman ajoitusta, säästät noin <strong>27 € kuukaudessa</strong>.</p>

      <h2 {H2}>Milloin lataus kannattaa?</h2>
      <ul {UL}>
        <li><strong>Yöllä:</strong> useimpina päivinä halvimmat jaksot osuvat keskiyön ja aamun väliin.</li>
        <li><strong>Tuulisina päivinä:</strong> hinta voi olla hyvin matala myös päivällä, jopa negatiivinen.</li>
        <li><strong>Vältä arki-iltoja:</strong> klo 17–20 kulutus on suurimmillaan ja hinta usein päivän korkein.</li>
      </ul>

      <h2 {H2}>Näin ajastat latauksen</h2>
      <ol class="mt-2 list-decimal pl-5 space-y-1">
        <li>Avaa laskuri ja valitse <em>Tarkempi laskenta → Etsi halvin aika</em>.</li>
        <li>Valitse kestoksi arvioitu latausaika (esim. 11 kW:n laturilla 30 kWh noin 3 h, 3,7 kW:n laturilla noin 8 h).</li>
        <li>Valitse <em>Valmis viimeistään</em> -kohtaan aika, jolloin lähdet aamulla.</li>
        <li>Aseta ajastus auton tai latausaseman sovelluksesta laskurin ehdottamaan aikaan.</li>
      </ol>
      <p {P}>Monissa latausasemissa ja autoissa on myös valmis pörssisähköohjaus. Laskurilla voit tarkistaa,
      paljonko ajoitus kyseisenä päivänä säästää.</p>

      <p {NOTE}>Tarkista myös sähkönsiirtosopimuksesi. Jos sinulla on aikasiirto (yösiirto), siirtomaksu on
      yleensä halvempi klo 22–07, mikä tekee yölatauksesta vielä edullisempaa.</p>""",
    [("Säästölaskuri", ""), ("Säästövinkit", "saastovinkit.html"), ("Sähköauton lataus", "sahkoauton-lataus-halvin-aika.html")],
)

pages["saunan-lammitys-hinta.html"] = page(
    "saunan-lammitys-hinta.html",
    "Paljonko saunan lämmitys maksaa? Sähkökiukaan hinta pörssisähköllä",
    "Sähkökiuas kuluttaa 6–9 kW. Katso paljonko saunominen maksaa pörssisähköllä eri hinnoilla ja miten valitset edullisimman saunavuoron.",
    "Paljonko saunan lämmitys maksaa pörssisähköllä?",
    f"""
      <p {P}>Sähkökiuas on tavallisen kodin tehokkaimpia laitteita. Kun kiuas on päällä, se kuluttaa yhtä paljon
      sähköä kuin kymmenet muut laitteet yhteensä. Siksi saunavuoron ajankohdalla on pörssisähköllä
      yllättävän suuri merkitys.</p>

      <h2 {H2}>Paljonko sähkökiuas kuluttaa?</h2>
      <p {P}>Tavallisen kotisaunan sähkökiukaan teho on 6–9 kW. Lämmitys kestää noin tunnin, ja saunoessa
      termostaatti pitää kiukaan päällä osan ajasta. Yksi saunailta kuluttaa karkeasti <strong>6–12 kWh</strong>
      kiukaan tehosta ja saunomisen pituudesta riippuen.</p>

      <h2 {H2}>Saunaillan hinta eri sähkön hinnoilla</h2>
{table(["Pörssihinta", "9 kWh:n saunailta"], [
    ["3 snt/kWh", "0,27 €"],
    ["10 snt/kWh", "0,90 €"],
    ["25 snt/kWh", "2,25 €"],
])}
      <p {P}>Jos saunot kolmesti viikossa ja siirrät saunavuoron kalleimmalta illan tunnilta pari tuntia
      myöhemmäksi, säästö voi olla useita kymppejä vuodessa.</p>

      <h2 {H2}>Milloin saunaan?</h2>
      <p {P}>Arki-iltojen alku, noin klo 17–20, on usein päivän kalleinta aikaa, koska silloin moni kokkaa,
      pesee pyykkiä ja lämmittää saunaa. Jo klo 21 jälkeen hinta on monesti selvästi matalampi. Laskurin
      <em>Kannattaako nyt?</em> -osion sauna-kortti kertoo suoraan, kannattaako kiuas laittaa päälle nyt
      vai odottaa, ja paljonko odottaminen säästää.</p>

      <h2 {H2}>Vinkit edullisempaan saunomiseen</h2>
      <ul {UL}>
        <li>Lämmitä sauna halvimmalla jaksolla ja saunokaa peräkkäin, jotta kiuasta ei tarvitse lämmittää kahdesti.</li>
        <li>Sulje kiuas heti saunomisen jälkeen, sillä jälkilöylyt riittävät kuivattamaan saunan.</li>
        <li>Käytä kiukaan ajastinta, niin sauna on lämmin juuri silloin kun hinta on matala.</li>
      </ul>""",
    [("Säästölaskuri", ""), ("Säästövinkit", "saastovinkit.html"), ("Saunan lämmitys", "saunan-lammitys-hinta.html")],
)

hub_items = "\n".join(
    f"""      <li class="mt-3"><a class="text-base font-semibold text-slate-900 underline hover:no-underline" href="./{f}">{t}</a></li>"""
    for f, t in GUIDES
)
pages["saastovinkit.html"] = page(
    "saastovinkit.html",
    "Säästövinkit pörssisähkön käyttäjälle | Pörssisähkö-säästölaskuri",
    "Käytännön oppaat pörssisähkön käyttäjälle: milloin huomisen hinnat julkaistaan, milloin pestä pyykit, ladata sähköauto ja lämmittää sauna edullisimmin.",
    "Säästövinkit pörssisähkön käyttäjälle",
    f"""
      <p {P}>Pörssisähköllä sama sähkö voi maksaa illalla kymmenen kertaa enemmän kuin yöllä. Näissä oppaissa
      kerrotaan, milloin eri laitteita kannattaa käyttää ja paljonko ajoitus käytännössä säästää.</p>
      <ul class="mt-2">
{hub_items}
      </ul>""",
    [("Säästölaskuri", ""), ("Säästövinkit", "saastovinkit.html")],
    is_article=False,
)

for name, html in pages.items():
    (DOCS / name).write_text(html, encoding="utf-8", newline="\n")
    print("wrote", name)


# RSS-syöte oppaista. Lukijasovellukset ja automaatiot (esim. Feedly, IFTTT) näkevät
# uudet oppaat ilman, että sivulla tarvitsee käydä. pubDate on RFC 822 -muodossa.
def rss_date(iso):
    return format_datetime(datetime.fromisoformat(iso).replace(hour=12, tzinfo=timezone.utc))


items = "\n".join(f"""    <item>
      <title>{escape(h1)}</title>
      <link>{SITE}/{f}</link>
      <guid isPermaLink="true">{SITE}/{f}</guid>
      <description>{escape(desc)}</description>
      <pubDate>{rss_date(DATE)}</pubDate>
    </item>""" for f, h1, desc in FEED_ITEMS)

feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Pörssisähkö-säästölaskuri: säästövinkit</title>
    <link>{SITE}/saastovinkit.html</link>
    <atom:link href="{SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Käytännön oppaat pörssisähkön käyttäjälle: milloin sähkö on halvinta ja paljonko ajoitus säästää.</description>
    <language>fi</language>
    <lastBuildDate>{rss_date(DATE)}</lastBuildDate>
{items}
  </channel>
</rss>
"""
(DOCS / "feed.xml").write_text(feed, encoding="utf-8", newline="\n")
print("wrote feed.xml")
