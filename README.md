# Nemovitosti

Hlídač bytů na prodej v Praze jako aplikace do mobilu. Běží v Safari (nebo v Chromu na Androidu) jako aplikace
na ploše (PWA), data drží v telefonu a synchronizuje je se soukromým úložištěm `hanclmichal/nemovitosti-data`.
Stejná architektura jako Trénink a IT Pojmy. Aplikaci používají oba manželé, každý na svém telefonu.

Adresa: https://hanclmichal.github.io/nemovitosti/

## Co umí

- **Byty:** souhrn (aktivní nabídky, kolik je v budgetu, medián ceny za m², nové za 7 dní), záložky podle stavu
  (aktivní, vybrané, zamítnuté, stažené a prodané, vše), hledání podle ulice, lokality nebo projektu,
  filtry (dispozice, lokalita, od developerů, jen s terasou) a řazení.
- **Detail bytu:** cena a její historie, zlevnění, cena vůči budgetu, stav (nový, zajímavý, prohlídka, rezervace,
  zamítnuto, stažený, prodáno), společná poznámka s podpisem, kdo ji naposledy upravil, údaje z inzerátu
  a odkazy na portály a Mapy.cz.
- **Graf:** cena podle plochy pro aktuální výběr, s čárou budgetu a horní hranice; klepnutím na bod se otevře byt.
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
změní poznámku a hlídací pes cenu téhož bytu, zůstane obojí. Seznam zdrojů a historie cen se při souběhu spojí.

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
   a oprávněním Contents: Read and write, a vyplnit jméno (ukáže se u poznámek a v historii změn).

## Nasazení

GitHub Pages z větve `main`, složka `/` (root). Při každé změně kódu zvýšit `VERSION` v `sw.js`
(a `APP_VERSION` v `app/main.js`), aby si telefony stáhly novou verzi (aplikace pak nabídne „Načíst“).
