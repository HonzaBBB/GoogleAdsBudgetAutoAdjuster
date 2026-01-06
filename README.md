# Budget Auto-Adjuster pro Google Ads

Google Ads Script pro automatickou úpravu rozpočtů kampaní na základě výkonu.

## Verze

| Soubor | Použití | Spouštět z |
|--------|---------|------------|
| `AutoBudgetAdjuster.js` | Jeden účet | Jednotlivý Google Ads účet |
| `AutoBudgetAdjuster_MCC.js` | Více účtů | MCC (Manager Account) |

**Doporučení:** Pro správu více klientů používej MCC verzi.

---

## Co script dělá

| Akce | Podmínka | Změna |
|------|----------|-------|
| **Zvýšení** | Kampaň je `BUDGET_CONSTRAINED` + PNO < 15% | +30% |
| **Snížení** | Spend < 70% budgetu za 14 dní | actual spend + 20% rezerva |

## Logika

### Zvýšení rozpočtu
Kampaň je omezená rozpočtem, ale zároveň je profitabilní (nízké PNO). Má smysl do ní investovat více.

### Snížení rozpočtu
Kampaň nevyužívá rozpočet - buď nemá dostatek poptávky, nebo je příliš restriktivní.

---

## Konfigurace

### Single-account verze

```javascript
const CONFIG = {
  MAX_PNO_FOR_INCREASE: 15,      // PNO threshold pro zvýšení (%)
  INCREASE_MULTIPLIER: 1.3,      // +30% při BUDGET_CONSTRAINED
  UNDERSPEND_THRESHOLD: 0.7,     // 70% - pod tím = underspend
  DECREASE_BUFFER: 1.2,          // actual + 20% rezerva
  LOOKBACK_DAYS: 14,             // Počet dní pro výpočet
  NOTIFICATION_EMAIL: 'vas@email.cz',
  MIN_BUDGET: 160                // Minimální budget (Kč)
};
```

### MCC verze

```javascript
const CONFIG = {
  // Seznam účtů k monitorování (Customer ID bez pomlček)
  MONITORED_ACCOUNTS: [
    '1234567890', // Account 1
    '2345678901', // Account 2
  ],
  
  MAX_PNO_FOR_INCREASE: 15,
  INCREASE_MULTIPLIER: 1.3,
  UNDERSPEND_THRESHOLD: 0.7,
  DECREASE_BUFFER: 1.2,
  LOOKBACK_DAYS: 14,
  NOTIFICATION_EMAIL: 'vas@email.cz',
  MIN_BUDGET: 160
};
```

---

## Instalace

### Single-account verze
1. Otevři Google Ads účet
2. Tools & Settings → Bulk Actions → Scripts
3. Klikni na **+** pro nový script
4. Vlož kód z `AutoBudgetAdjuster.js`
5. Ulož a autorizuj přístupy

### MCC verze
1. Otevři MCC účet (Manager Account)
2. Tools & Settings → Bulk Actions → Scripts
3. Klikni na **+** pro nový script
4. Vlož kód z `AutoBudgetAdjuster_MCC.js`
5. Doplň `MONITORED_ACCOUNTS` s Customer ID účtů
6. Ulož a autorizuj přístupy

---

## Spouštění

**Doporučené nastavení:** 1x týdně (např. pondělí ráno)

1. V editoru scriptu klikni na **Schedule**
2. Vyber **Weekly**
3. Zvol den a čas

### Proč ne denně?
Při denním spouštění hrozí kaskádový efekt - script zvýší budget, kampaň je další den opět `BUDGET_CONSTRAINED`, script znovu zvýší, atd. Pro denní spouštění by bylo potřeba přidat cooldown logiku.

---

## Notifikace

### Single-account verze
Jeden email per účet:
```
Budget Auto-Adjuster provedl následující změny:

Účet: Můj účet
Datum: 30.12.2025 9:00:00

↑ SEA_Brand
   500 Kč -> 650 Kč
   Důvod: Budget Constrained + PNO 12.3%
```

### MCC verze
Agregovaný email za všechny účty:
```
Budget Auto-Adjuster (MCC) - 30.12.2025 9:00:00
══════════════════════════════════════════════════

Zpracováno účtů: 5
Účtů se změnami: 2
Celkem změn: 3

↑ Zvýšení: 2
↓ Snížení: 1

══════════════════════════════════════════════════
DETAIL ZMĚN
══════════════════════════════════════════════════

▸ Klient ABC
────────────────────────────────────────
↑ SEA_Brand
   500 CZK → 650 CZK
   Důvod: Budget Constrained + PNO 12.3%

▸ Klient XYZ
────────────────────────────────────────
↓ PMax_produkty [PMAX]
   1000 CZK → 720 CZK
   Důvod: Underspend: avg 600 CZK/den (60% budgetu)
```

---

## Metriky

### PNO (Podíl Nákladů na Obratu)
```
PNO = (Náklady / Obrat) × 100
```
Čím nižší PNO, tím lepší (menší část obratu jde na reklamu).

### Budget Constrained
Detekováno přes `campaign.primary_status_reasons` obsahující `BUDGET_CONSTRAINED`. To je přímo status, který Google ukazuje v UI jako "Omezeno rozpočtem".

---

## Požadavky

- Google Ads účet s aktivními kampaněmi
- Trackování konverzí s hodnotou (pro PNO)
- Oprávnění scriptu měnit rozpočty
- Pro MCC verzi: Manager Account s přístupem k jednotlivým účtům

---

## Omezení

- Vyžaduje trackování konverzní hodnoty pro výpočet PNO
- Kampaně bez konverzní hodnoty jsou ignorovány pro zvýšení (ale mohou být sníženy při underspend)

---

## Changelog

### v2.0.0 (MCC)
- Nová MCC verze pro správu více účtů
- Agregované notifikace za všechny účty
- Statistiky zvýšení/snížení v emailu
- Vylepšené error handling

### v1.0.0
- Základní single-account verze
- Zvýšení při BUDGET_CONSTRAINED + nízké PNO
- Snížení při underspend
