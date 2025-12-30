# Budget Auto-Adjuster pro Google Ads

Google Ads Script pro automatickou úpravu rozpočtů kampaní na základě výkonu.

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

## Konfigurace

```javascript
const CONFIG = {
  // PNO threshold pro zvýšení (v %)
  MAX_PNO_FOR_INCREASE: 15,
  
  // O kolik zvýšit budget při BUDGET_CONSTRAINED (1.3 = +30%)
  INCREASE_MULTIPLIER: 1.3,
  
  // Threshold pro underspend (0.7 = 70%)
  UNDERSPEND_THRESHOLD: 0.7,
  
  // Rezerva při snižování (1.2 = actual + 20%)
  DECREASE_BUFFER: 1.2,
  
  // Počet dní pro výpočet
  LOOKBACK_DAYS: 14,
  
  // Email pro notifikace (prázdný = bez emailu)
  NOTIFICATION_EMAIL: 'vas@email.cz',

 // Minimální budget - pod tuto hodnotu script budget nesníží (v Kč)
  MIN_BUDGET: 160
};
```

## Instalace

1. Otevři Google Ads účet
2. Tools & Settings → Bulk Actions → Scripts
3. Klikni na **+** pro nový script
4. Vlož kód scriptu
5. Ulož a autorizuj přístupy

## Spouštění

**Doporučené nastavení:** 1x týdně (např. pondělí ráno)

1. V editoru scriptu klikni na **Schedule**
2. Vyber **Weekly**
3. Zvol den a čas

### Proč ne denně?

Při denním spouštění hrozí kaskádový efekt - script zvýší budget, kampaň je další den opět `BUDGET_CONSTRAINED`, script znovu zvýší, atd. Pro denní spouštění by bylo potřeba přidat cooldown logiku.

## Notifikace

Script odesílá email s přehledem změn:

```
Budget Auto-Adjuster provedl následující změny:

Účet: Můj účet
Datum: 30.12.2025 9:00:00

↑ SEA_Brand
   500 Kč -> 650 Kč
   Důvod: Budget Constrained + PNO 12.3%

↓ PMax_produkty
   1000 Kč -> 720 Kč
   Důvod: Underspend: avg 600 Kč/den (60% budgetu)
```

## Metriky

### PNO (Podíl Nákladů na Obratu)

```
PNO = (Náklady / Obrat) × 100

```

Čím nižší PNO, tím lepší (menší část obratu jde na reklamu).

### Budget Constrained

Detekováno přes `campaign.primary_status_reasons` obsahující `BUDGET_CONSTRAINED`. To je přímo status, který Google ukazuje v UI jako "Omezeno rozpočtem".

## Omezení

- Funguje pouze na úrovni jednotlivého účtu (ne MCC)
- Vyžaduje trackování konverzní hodnoty pro výpočet PNO
- Kampaně bez konverzní hodnoty jsou ignorovány pro zvýšení (ale mohou být sníženy při underspend)

## Požadavky

- Google Ads účet s aktivními kampaněmi
- Trackování konverzí s hodnotou (pro PNO)
- Oprávnění scriptu měnit rozpočty

## Changelog

### v1.0.0
- Základní verze
- Zvýšení při BUDGET_CONSTRAINED + nízké PNO
- Snížení při underspend
- Email notifikace

## Licence

MIT
