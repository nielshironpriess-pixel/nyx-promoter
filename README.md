# Nyx Promoter

Din egen app som promoter: bordkort fra Nyx, bookinger pr. aften, gæsteliste, statistik over forventet og solgt, fødselsdage, opfølgning og noter.
Kan lægges på hjemmeskærmen som en app og opdateres live mellem telefon og computer.

- **Frontend:** almindelig HTML/CSS/JavaScript (ingen build), hostes gratis på Vercel.
- **Backend:** samme Supabase-projekt som Goon. Du logger ind med din Goon-konto, og kun du kan se dine tal.

Står `js/config.js` tom, kører appen i **demo-tilstand** med eksempeldata i browseren.

## Kør lokalt

```bash
npm run dev
# åbn http://localhost:3000
```

## Sæt den op (ca. 5 min.)

### 1. Supabase
1. Åbn Goon-projektet på [supabase.com](https://supabase.com).
2. Gå til **SQL Editor → New query**, indsæt hele [`supabase/nyx.sql`](supabase/nyx.sql) og tryk **Run**.

### 2. Vercel
1. På [vercel.com](https://vercel.com): **Add New → Project**, vælg repoet `nyx-promoter`, lad *Framework Preset* stå på **Other**, og tryk **Deploy**.
2. Åbn adressen (fx `nyx-promoter.vercel.app`) på telefonen og log ind med din Goon-email og adgangskode.

### 3. Hjemmeskærm
- **iPhone:** åbn siden i Safari → Del → **Føj til hjemmeskærm**.
- **Android:** menuen ⋮ → **Installer app**.

## Data
Alt ligger i én tabel, `nyx_docs` (bookinger, aftener, noter og indstillinger som JSON), låst så kun du kan se dine egne rækker.
