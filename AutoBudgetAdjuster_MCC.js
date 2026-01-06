/**
 * Budget Auto-Adjuster (MCC Version)
 * 
 * Spouštět z MCC účtu - prochází všechny definované účty.
 * 
 * ZVÝŠÍ budget (+30%) když:
 * - Kampaň je BUDGET_CONSTRAINED
 * - PNO < 15%
 * 
 * SNÍŽÍ budget (actual spend + 20%) když:
 * - Spend < 70% budgetu za posledních 14 dní
 * 
 * @version 2.0 (MCC)
 * @author Honza Brzák
 * @email janbrzak.prg@gmail.com
 */

// ============ CONFIG ============
const CONFIG = {
  // Seznam účtů k monitorování (Customer ID bez pomlček)
  MONITORED_ACCOUNTS: [
    '1234567890', // Account 1
    '2345678901', // Account 2
    '3456789012', // Account 3
    // Přidej další účty...
  ],
  
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
  NOTIFICATION_EMAIL: 'janbrzak.prg@gmail.com',
   
  // Minimální budget - pod tuto hodnotu script budget nesníží (v CZK)
  MIN_BUDGET: 160,
  
  // Label pro označení upravených kampaní (pro tracking)
  ADJUSTMENT_LABEL: 'BudgetAdjusted'
};

// ============ MAIN ============
function main() {
  Logger.log('=== Budget Auto-Adjuster (MCC) ===');
  Logger.log(`Datum: ${new Date().toLocaleString('cs-CZ')}`);
  Logger.log(`Počet účtů k zpracování: ${CONFIG.MONITORED_ACCOUNTS.length}`);
  
  const allChanges = [];
  let accountsProcessed = 0;
  let accountsWithChanges = 0;
  
  // Získání účtů z MCC
  const accountIterator = AdsManagerApp.accounts()
    .withIds(CONFIG.MONITORED_ACCOUNTS)
    .get();
  
  while (accountIterator.hasNext()) {
    const account = accountIterator.next();
    const customerId = account.getCustomerId();
    const accountName = account.getName();
    
    Logger.log(`\n${'='.repeat(50)}`);
    Logger.log(`Účet: ${accountName} (${customerId})`);
    Logger.log('='.repeat(50));
    
    // Přepnutí kontextu na účet
    AdsManagerApp.select(account);
    
    // Zpracování účtu
    const changes = processAccount(accountName, customerId);
    
    accountsProcessed++;
    if (changes.length > 0) {
      accountsWithChanges++;
      allChanges.push(...changes);
    }
  }
  
  // Souhrn
  Logger.log(`\n${'='.repeat(50)}`);
  Logger.log('SOUHRN');
  Logger.log('='.repeat(50));
  Logger.log(`Zpracováno účtů: ${accountsProcessed}`);
  Logger.log(`Účtů se změnami: ${accountsWithChanges}`);
  Logger.log(`Celkem změn: ${allChanges.length}`);
  
  // Odeslání notifikace
  if (allChanges.length > 0 && CONFIG.NOTIFICATION_EMAIL) {
    sendNotification(allChanges, accountsProcessed);
  }
  
  Logger.log('\n=== Hotovo ===');
}

// ============ PROCESS ACCOUNT ============
function processAccount(accountName, customerId) {
  const changes = [];
  
  // Získání dat o kampaních
  const campaignData = getCampaignData();
  
  if (Object.keys(campaignData).length === 0) {
    Logger.log('Žádné aktivní kampaně.');
    return changes;
  }
  
  for (const campaignId in campaignData) {
    const data = campaignData[campaignId];
    
    Logger.log(`\nKampaň: ${data.name}`);
    Logger.log(`  Budget: ${data.dailyBudget.toFixed(0)} CZK`);
    Logger.log(`  Avg daily spend: ${data.avgDailySpend.toFixed(0)} CZK`);
    Logger.log(`  PNO: ${data.pno !== null ? (data.pno * 100).toFixed(1) + '%' : 'N/A'}`);
    Logger.log(`  Budget Constrained: ${data.isBudgetConstrained}`);
    
    // === ZVÝŠENÍ ===
    if (data.isBudgetConstrained && data.pno !== null && data.pno < CONFIG.MAX_PNO_FOR_INCREASE / 100) {
      const newBudget = data.dailyBudget * CONFIG.INCREASE_MULTIPLIER;
      
      Logger.log(`  -> ZVÝŠENÍ: ${data.dailyBudget.toFixed(0)} -> ${newBudget.toFixed(0)} CZK (+30%)`);
      
      const success = setBudget(data.campaignType, data.name, newBudget);
      
      if (success) {
        changes.push({
          accountName: accountName,
          customerId: customerId,
          campaign: data.name,
          campaignType: data.campaignType,
          action: 'INCREASE',
          oldBudget: data.dailyBudget,
          newBudget: newBudget,
          reason: `Budget Constrained + PNO ${(data.pno * 100).toFixed(1)}%`
        });
      }
    }
    
    // === SNÍŽENÍ ===
    else if (data.avgDailySpend < data.dailyBudget * CONFIG.UNDERSPEND_THRESHOLD) {
      const newBudget = Math.max(data.avgDailySpend * CONFIG.DECREASE_BUFFER, CONFIG.MIN_BUDGET);
      
      // Snížit jen pokud je nový budget výrazně nižší
      if (newBudget < data.dailyBudget * 0.95) {
        Logger.log(`  -> SNÍŽENÍ: ${data.dailyBudget.toFixed(0)} -> ${newBudget.toFixed(0)} CZK (underspend)`);
        
        const success = setBudget(data.campaignType, data.name, newBudget);
        
        if (success) {
          changes.push({
            accountName: accountName,
            customerId: customerId,
            campaign: data.name,
            campaignType: data.campaignType,
            action: 'DECREASE',
            oldBudget: data.dailyBudget,
            newBudget: newBudget,
            reason: `Underspend: avg ${data.avgDailySpend.toFixed(0)} CZK/den (${((data.avgDailySpend / data.dailyBudget) * 100).toFixed(0)}% budgetu)`
          });
        }
      }
    }
    
    else {
      Logger.log(`  -> Žádná změna`);
    }
  }
  
  return changes;
}

// ============ GET CAMPAIGN DATA ============
function getCampaignData() {
  const data = {};
  
  const statusQuery = `
    SELECT 
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.primary_status_reasons,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.experiment_type != 'EXPERIMENT'
      AND segments.date DURING LAST_14_DAYS
  `;
  
  try {
    const report = AdsApp.report(statusQuery);
    const rows = report.rows();
    
    while (rows.hasNext()) {
      const row = rows.next();
      const campaignId = row['campaign.id'];
      const campaignName = row['campaign.name'];
      const channelType = row['campaign.advertising_channel_type'];
      const statusReasons = row['campaign.primary_status_reasons'] || '';
      const budgetMicros = parseFloat(row['campaign_budget.amount_micros'] || 0);
      const costMicros = parseFloat(row['metrics.cost_micros'] || 0);
      const conversionValue = parseFloat(row['metrics.conversions_value'] || 0);
      
      if (!data[campaignId]) {
        data[campaignId] = {
          name: campaignName,
          campaignType: channelType,
          dailyBudget: budgetMicros / 1000000,
          isBudgetConstrained: statusReasons.includes('BUDGET_CONSTRAINED'),
          totalCost: 0,
          totalRevenue: 0
        };
      }
      
      data[campaignId].totalCost += costMicros;
      data[campaignId].totalRevenue += conversionValue;
    }
    
    // Dopočítání PNO a avg spend
    for (const campaignId in data) {
      const campaign = data[campaignId];
      const cost = campaign.totalCost / 1000000;
      const revenue = campaign.totalRevenue;
      
      campaign.avgDailySpend = cost / CONFIG.LOOKBACK_DAYS;
      campaign.pno = revenue > 0 ? cost / revenue : null;
    }
    
  } catch (e) {
    Logger.log(`CHYBA při získávání dat: ${e.message}`);
  }
  
  return data;
}

// ============ SET BUDGET ============
function setBudget(campaignType, campaignName, newBudgetCZK) {
  let campaign;
  
  try {
    if (campaignType === 'PERFORMANCE_MAX') {
      const iterator = AdsApp.performanceMaxCampaigns()
        .withCondition(`campaign.name = "${campaignName}"`)
        .get();
      if (iterator.hasNext()) {
        campaign = iterator.next();
      }
    } else {
      const iterator = AdsApp.campaigns()
        .withCondition(`campaign.name = "${campaignName}"`)
        .get();
      if (iterator.hasNext()) {
        campaign = iterator.next();
      }
    }
    
    if (campaign) {
      const budget = campaign.getBudget();
      budget.setAmount(newBudgetCZK);
      Logger.log(`    Budget změněn na ${newBudgetCZK.toFixed(0)} CZK`);
      return true;
    } else {
      Logger.log(`    CHYBA: Kampaň nenalezena pro změnu budgetu`);
      return false;
    }
    
  } catch (e) {
    Logger.log(`    CHYBA při změně budgetu: ${e.message}`);
    return false;
  }
}

// ============ SEND NOTIFICATION ============
function sendNotification(allChanges, accountsProcessed) {
  const dateStr = new Date().toLocaleString('cs-CZ');
  
  // Seskupení změn podle účtu
  const changesByAccount = {};
  for (const change of allChanges) {
    if (!changesByAccount[change.accountName]) {
      changesByAccount[change.accountName] = [];
    }
    changesByAccount[change.accountName].push(change);
  }
  
  const accountCount = Object.keys(changesByAccount).length;
  const subject = `[Budget Adjuster] ${allChanges.length} změn v ${accountCount} účtech`;
  
  let body = `Budget Auto-Adjuster (MCC) - ${dateStr}\n`;
  body += `${'═'.repeat(50)}\n\n`;
  body += `Zpracováno účtů: ${accountsProcessed}\n`;
  body += `Účtů se změnami: ${accountCount}\n`;
  body += `Celkem změn: ${allChanges.length}\n\n`;
  
  // Statistiky
  const increases = allChanges.filter(c => c.action === 'INCREASE').length;
  const decreases = allChanges.filter(c => c.action === 'DECREASE').length;
  body += `↑ Zvýšení: ${increases}\n`;
  body += `↓ Snížení: ${decreases}\n\n`;
  
  body += `${'═'.repeat(50)}\n`;
  body += `DETAIL ZMĚN\n`;
  body += `${'═'.repeat(50)}\n\n`;
  
  for (const accountName in changesByAccount) {
    const changes = changesByAccount[accountName];
    body += `\n▸ ${accountName}\n`;
    body += `${'─'.repeat(40)}\n`;
    
    for (const change of changes) {
      const arrow = change.action === 'INCREASE' ? '↑' : '↓';
      const typeLabel = change.campaignType === 'PERFORMANCE_MAX' ? ' [PMAX]' : '';
      body += `${arrow} ${change.campaign}${typeLabel}\n`;
      body += `   ${change.oldBudget.toFixed(0)} CZK → ${change.newBudget.toFixed(0)} CZK\n`;
      body += `   Důvod: ${change.reason}\n\n`;
    }
  }
  
  body += `\n${'═'.repeat(50)}\n`;
  body += `Konfigurace:\n`;
  body += `- Max PNO pro zvýšení: ${CONFIG.MAX_PNO_FOR_INCREASE}%\n`;
  body += `- Zvýšení: +${((CONFIG.INCREASE_MULTIPLIER - 1) * 100).toFixed(0)}%\n`;
  body += `- Underspend threshold: ${(CONFIG.UNDERSPEND_THRESHOLD * 100).toFixed(0)}%\n`;
  body += `- Min budget: ${CONFIG.MIN_BUDGET} CZK\n`;
  
  try {
    MailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, body);
    Logger.log(`\nNotifikace odeslána na ${CONFIG.NOTIFICATION_EMAIL}`);
  } catch (e) {
    Logger.log(`\nCHYBA při odesílání emailu: ${e.message}`);
  }
}
