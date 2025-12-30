/**
 * Budget Auto-Adjuster
 * 
 * ZVÝŠÍ budget (+30%) když:
 * - Kampaň je BUDGET_CONSTRAINED
 * - PNO < 15%
 * 
 * SNÍŽÍ budget (actual spend + 20%) když:
 * - Spend < 70% budgetu za posledních 14 dní
 */

// ============ CONFIG ============
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
  NOTIFICATION_EMAIL: 'TVUJ.EMAIL@GMAIL.COM'
};

function main() {
  const accountName = AdsApp.currentAccount().getName();
  Logger.log(`=== Budget Auto-Adjuster: ${accountName} ===`);
  
  const changes = [];
  
  // Získání dat o kampaních
  const campaignData = getCampaignData();
  
  for (const campaignId in campaignData) {
    const data = campaignData[campaignId];
    
    Logger.log(`\nKampaň: ${data.name}`);
    Logger.log(`  Budget: ${data.dailyBudget.toFixed(0)} Kč`);
    Logger.log(`  Avg daily spend: ${data.avgDailySpend.toFixed(0)} Kč`);
    Logger.log(`  PNO: ${data.pno !== null ? (data.pno * 100).toFixed(1) + '%' : 'N/A'}`);
    Logger.log(`  Budget Constrained: ${data.isBudgetConstrained}`);
    
    // === ZVÝŠENÍ ===
    if (data.isBudgetConstrained && data.pno !== null && data.pno < CONFIG.MAX_PNO_FOR_INCREASE / 100) {
      const newBudget = data.dailyBudget * CONFIG.INCREASE_MULTIPLIER;
      
      Logger.log(`  -> ZVÝŠENÍ: ${data.dailyBudget.toFixed(0)} -> ${newBudget.toFixed(0)} Kč (+30%)`);
      
      setBudget(data.campaignType, data.name, newBudget);
      
      changes.push({
        campaign: data.name,
        action: 'INCREASE',
        oldBudget: data.dailyBudget,
        newBudget: newBudget,
        reason: `Budget Constrained + PNO ${(data.pno * 100).toFixed(1)}%`
      });
    }
    
    // === SNÍŽENÍ ===
    else if (data.avgDailySpend < data.dailyBudget * CONFIG.UNDERSPEND_THRESHOLD) {
      const newBudget = data.avgDailySpend * CONFIG.DECREASE_BUFFER;
      
      // Snížit jen pokud je nový budget výrazně nižší
      if (newBudget < data.dailyBudget * 0.95) {
        Logger.log(`  -> SNÍŽENÍ: ${data.dailyBudget.toFixed(0)} -> ${newBudget.toFixed(0)} Kč (underspend)`);
        
        setBudget(data.campaignType, data.name, newBudget);
        
        changes.push({
          campaign: data.name,
          action: 'DECREASE',
          oldBudget: data.dailyBudget,
          newBudget: newBudget,
          reason: `Underspend: avg ${data.avgDailySpend.toFixed(0)} Kč/den (${((data.avgDailySpend / data.dailyBudget) * 100).toFixed(0)}% budgetu)`
        });
      }
    }
    
    else {
      Logger.log(`  -> Žádná změna`);
    }
  }
  
  // Odeslání notifikace
  if (changes.length > 0 && CONFIG.NOTIFICATION_EMAIL) {
    sendNotification(accountName, changes);
  }
  
  Logger.log(`\n=== Hotovo. Změn: ${changes.length} ===`);
}

function getCampaignData() {
  const data = {};
  
  // Query pro status a budget
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
  
  return data;
}

function setBudget(campaignType, campaignName, newBudgetCZK) {
  let campaign;
  
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
    Logger.log(`    Budget změněn na ${newBudgetCZK.toFixed(0)} Kč`);
  } else {
    Logger.log(`    CHYBA: Kampaň nenalezena pro změnu budgetu`);
  }
}

function sendNotification(accountName, changes) {
  const subject = `[Budget Adjuster] ${accountName}: ${changes.length} změn`;
  
  let body = `Budget Auto-Adjuster provedl následující změny:\n\n`;
  body += `Účet: ${accountName}\n`;
  body += `Datum: ${new Date().toLocaleString('cs-CZ')}\n\n`;
  
  for (const change of changes) {
    const arrow = change.action === 'INCREASE' ? '↑' : '↓';
    body += `${arrow} ${change.campaign}\n`;
    body += `   ${change.oldBudget.toFixed(0)} Kč -> ${change.newBudget.toFixed(0)} Kč\n`;
    body += `   Důvod: ${change.reason}\n\n`;
  }
  
  MailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, body);
  Logger.log(`\nNotifikace odeslána na ${CONFIG.NOTIFICATION_EMAIL}`);
}
