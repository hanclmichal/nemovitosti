# Nemovitosti

Hlídač bytů na prodej v Praze jako aplikace do mobilu. Běží v Safari (nebo v Chromu na Androidu) jako aplikace
na ploše (PWA), data drží v telefonu a synchronizuje je se soukromým úložištěm `hanclmichal/nemovitosti-data`.
Stejná architektura jako Trénink a IT Pojmy. Aplikaci používají oba manželé, každý na svém telefonu.

Adresa: https://hanclmichal.github.io/nemovitosti/

## Co umí

- **Byty:** souhrn (aktivní nabídky, kolik je v budgetu, medián ceny za m², nové za 7 dní), záložky podle stavu
  (aktivní, vybrané, zamítnuté, stažené a prodané, vše), hledání podle ulice, lokality nebo projektu,
  filtry (dispozice, lokalita, od developerů, jen s terasou) a řazení.
- **Profily:** Míša (zelený) a Zuzka (růžová), přepínají se tlačítkem s písmenem v horní liště. Profil určuje barvu aplikace,
  čí hodnocení je „moje“ a podpis u poznámek i v historii změn.
- **Detail bytu:** cena a její historie, zlevnění, cena vůči budgetu, stav (nový, zajímavý, prohlídka, rezervace,
  zamítnuto, stažený, prodáno), hodnocení 1–10 zvlášť od Míši a Zuzky, společná poznámka s podpisem, údaje
  z inzerátu a odkazy na portály a Mapy.cz. Při zamítnutí aplikace vyzve napsat důvod do poznámky.
- **Hodnocení v seznamu:** u každého bytu, řazení „Nejlépe hodnocené“ a filtry „Čeká na moje hodnocení“,
  „Nikdo nehodnotil“, „Průměr 7 a víc“, „Oba 7 a víc“.
- **Graf – Cena × plocha:** výřez podle plochy a ceny, barva podle stavu, hodnocení nebo ceny za m² vůči mediánu,
  čára mediánu ceny za m², budget a horní hranice. Klepnutí do grafu ukáže pod ním všechny byty z toho místa.
- **Graf – Lokality:** městské části podle počtu bytů v budgetu, mediánu ceny za m² nebo počtu bytů;
  klepnutím se seznam vyfiltruje na danou lokalitu.
- **Přidat:** ruční přidání inzerátu z jakéhokoli portálu.
- **Offline:** service worker drží aplikaci, IndexedDB data. Změny stavu a poznámek se odešlou jedním commitem,
  jakmile je signál.

Nové byty, změny cen a stažené inzeráty zapisuje každé ráno hlídací pes (naplánovaná úloha v Claude) commitem
do `nemovitosti-data`.

## Jak to funguje

```
Telefon (aplikace na ploše)                     GitHub
┌──────────────────────────────┐                ┌──────────────────────────────────┐
│ Service worker: kód aplikace │                │ hanclmichal/nemovitosti (veřejné) │ ← GitHub Pages
│ IndexedDB: byty + změny      │ ── Git Data API ──▶ hanclmichal/nemovitosti-data │ ← soukromá data
└──────────────────────────────┘                └──────────────────────────────────┘
                                                        ▲
                                     hlídací pes (každé ráno, git commit)
```

Synchronizace používá Git Data API (`git/trees`, `git/commits`, `git/refs`): stáhne jen soubory se změněným blobem
a změny z telefonu odešle jako jeden commit (jen fast-forward, při souběhu se znovu stáhne a sloučí).
Každý byt je samostatný soubor, takže se změny obou telefonů a hlídacího psa slučují po polích: když telefon
změní poznámku a hlídací pes cenu téhož bytu, zůstane obojí. Seznam zdrojů a historie cen se při souběhu spojí,
hodnocení obou manželů se slučují po jménech.

Ve veřejném repozitáři je jen kód. Byty, poznámky i budget jsou jen v soukromém `nemovitosti-data`.

## Struktura

```
index.html, styles.css, sw.js, manifest.webmanifest
app/          moduly (ES modules, bez build kroku)
  store.js    model dat v telefonu (IndexedDB)
  sync.js     synchronizace s GitHubem
  merge.js    slučování souběžných změn
  byty.js     stavy, filtry, řazení, cenové pásmo
  views/      obrazovky (seznam, detail, graf, přidat, nastavení, filtry)
icons/        ikony aplikace
```

Popis datových souborů je v README úložiště `nemovitosti-data`.

## Připojení telefonu

1. Otevřít adresu aplikace v Safari → Sdílet → Přidat na plochu.
2. Spustit aplikaci z plochy, v Nastavení vložit fine-grained token s přístupem k `nemovitosti-data`
   a oprávněním Contents: Read and write, a vybrat profil (Míša nebo Zuzka).

## Nasazení

GitHub Pages z větve `main`, složka `/` (root). Při každé změně kódu zvýšit `VERSION` v `sw.js`
(a `APP_VERSION` v `app/main.js`), aby si telefony stáhly novou verzi (aplikace pak nabídne „Načíst“).
