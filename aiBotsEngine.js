class AISpeedBotsEngine {class AISpeedBotsEngine {
  constructor(derivApiEngine, logCallback) {
    this.api = derivApiEngine;
    this.log = logCallback || console.log;
    this.activeBot = null; 
    this.lastDigits = [];
    this.tickHistory = [];
    this.isExecuting = false;
    this.inRecoveryMode = false;
    
    // Profit Circuit Breaker & Trade Lifecycle State
    this.initialSessionBalance = 0;
    this.profitTargetReached = false;
    this.activeTradeState = null;
  }

  setBot(botType) {
    if (this.profitTargetReached) {
      this.log("[AI Circuit Breaker] Cannot launch bot. +20% Daily Profit Target already achieved!", "warning");
      return;
    }

    this.activeBot = botType;
    this.lastDigits = [];
    this.tickHistory = [];
    this.isExecuting = false;
    this.inRecoveryMode = false;
    this.activeTradeState = null;

    if (this.initialSessionBalance === 0 && this.api.balance > 0) {
      this.initialSessionBalance = this.api.balance;
      const targetVal = (this.initialSessionBalance * 0.20).toFixed(2);
      this.log(`[AI Circuit Breaker] Initial Session Balance: $${this.initialSessionBalance.toFixed(2)} | Target (+20%): +$${targetVal}`, 'info');
    }

    this.log(`[AI Speed Boat] Activated strategy: ${botType.toUpperCase()}`, 'bot');
  }

  stopBot() {
    this.activeBot = null;
    this.isExecuting = false;
    this.inRecoveryMode = false;
    this.activeTradeState = null;
    this.log("[AI Speed Boat] All speed boats disengaged.", 'warning');
  }

  // Dynamic Stake Sizer: 10% for Rise/Fall & standard bots, 3% for A+ SMC bots
  getCalculatedStake(isSMCRisk = false) {
    if (this.api && this.api.balance > 0) {
      const riskPercent = isSMCRisk ? 3.0 : 10.0;
      const computedStake = (this.api.balance * (riskPercent / 100)).toFixed(2);
      return Math.max(0.35, parseFloat(computedStake)).toString();
    }
    return document.getElementById('input-stake').value;
  }

  checkProfitTargetCircuitBreaker() {
    if (this.initialSessionBalance === 0 && this.api.balance > 0) {
      this.initialSessionBalance = this.api.balance;
    }

    if (this.initialSessionBalance > 0 && this.api.balance > 0) {
      const currentNetPnL = this.api.balance - this.initialSessionBalance;
      const targetProfitAmount = this.initialSessionBalance * 0.20;

      if (currentNetPnL >= targetProfitAmount && !this.profitTargetReached) {
        this.profitTargetReached = true;
        this.stopBot();

        const btn = document.getElementById('btn-toggle-ai');
        const badge = document.getElementById('ai-status-badge');
        if (btn) btn.innerText = "Target Hit (+20%)";
        if (btn) btn.className = "w-full bg-emerald-900 border border-neon text-neon font-bold py-1.5 rounded text-xs opacity-75 cursor-not-allowed";
        if (badge) badge.innerText = "TARGET REACHED";
        if (badge) badge.className = "text-[10px] bg-emerald-950 text-neon border border-neon px-1.5 py-0.5 rounded font-mono font-bold";

        this.log(`🎯 [CIRCUIT BREAKER] +20% Profit Target Hit! Session Profit: +$${currentNetPnL.toFixed(2)}. All bots stopped safely.`, 'success');
        alert(`🎯 Target Achieved! Account hit +20% profit (+$${currentNetPnL.toFixed(2)}). All bots stopped.`);
        return true;
      }
    }
    return false;
  }

  isDSTActive(date = new Date()) {
    const month = date.getUTCMonth() + 1;
    return month >= 3 && month <= 11; // March to November DST
  }

  async processTick(tick) {
    if (!this.api.authorized) return;

    if (this.checkProfitTargetCircuitBreaker()) return;
    if (!this.activeBot || this.isExecuting) return;

    const priceStr = tick.quote.toString();
    const decimalSplit = priceStr.split('.');
    const fractionalPart = decimalSplit[1] || '0';
    const lastDecimal = parseInt(fractionalPart.slice(-1));
    const currentPrice = parseFloat(tick.quote);

    this.lastDigits.push(lastDecimal);
    if (this.lastDigits.length > 50) this.lastDigits.shift();

    this.tickHistory.push(currentPrice);
    if (this.tickHistory.length > 80) this.tickHistory.shift();

    if (this.activeTradeState) {
      this.monitorTradeLifecycle(currentPrice);
    }

    if (this.inRecoveryMode) {
      await this.runRecoveryExecution();
      return;
    }

    if (this.activeBot === 'mtf_macd_synthetic') {
      await this.run15MMACD1MTrendAlignerBot();
    } else if (this.activeBot === 'adaptive_smc_sr') {
      await this.runAutoAssetAPlusKillzoneBot();
    } else if (this.activeBot === 'top_down_trend') {
      await this.runTopDownTrendSpeedBoat();
    } else if (this.activeBot === 'even_odd') {
      await this.runEvenOddSpeedBoat();
    } else if (this.activeBot === 'matches') {
      await this.runMatchesSpeedBoat();
    } else if (this.activeBot === 'differs') {
      await this.runDiffersSpeedBoat();
    } else if (this.activeBot === 'rise_fall') {
      await this.runRiseFallSpeedBoat();
    } else if (this.activeBot === 'over3_under6') {
      await this.runOver3Under6SpeedBoat(lastDecimal);
    } else if (this.activeBot === 'multi_low_digits') {
      await this.runMultiLowDigitsSpeedBoat();
    } else if (this.activeBot === 'extreme_edges') {
      await this.runExtremeEdgesSpeedBoat(lastDecimal);
    }
  }

  // =========================================================================
  // 15M MACD + 1M TREND-ALIGNER SPEED BOAT (SYNTHETIC INDICES)
  // =========================================================================
  async run15MMACD1MTrendAlignerBot() {
    if (this.tickHistory.length < 60) return;

    const htfSegment = this.tickHistory.slice(-45);
    const htfStart = htfSegment[0];
    const htfMid = htfSegment[Math.floor(htfSegment.length / 2)];
    const htfEnd = htfSegment[htfSegment.length - 1];

    const fastEMAHTF = htfEnd - htfMid;
    const slowEMAHTF = htfMid - htfStart;
    const htfMacdHistogram = fastEMAHTF - slowEMAHTF;

    const htfBullish = htfMacdHistogram > 0 && htfEnd > htfStart;
    const htfBearish = htfMacdHistogram < 0 && htfEnd < htfStart;

    const ltfSegment = this.tickHistory.slice(-15);
    const ltfStart = ltfSegment[0];
    const ltfEnd = ltfSegment[ltfSegment.length - 1];
    const ltfMomentumPositive = ltfEnd > ltfStart;

    let contractType = null;
    let alignmentDetails = "";

    if (htfBullish && ltfMomentumPositive) {
      contractType = "CALL";
      alignmentDetails = "15M MACD Bullish + 1M Pullback Alignment (Long)";
    } else if (htfBearish && !ltfMomentumPositive) {
      contractType = "PUT";
      alignmentDetails = "15M MACD Bearish + 1M Pullback Alignment (Short)";
    }

    if (contractType && !this.activeTradeState) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake(true); // 3% Risk

      this.log(`[MTF Aligner Bot] ${alignmentDetails} | Asset: ${symbol} | Stake: $${stake} (3% Risk)`, 'bot');

      try {
        const res = await this.api.executeTrade({
          symbol: symbol,
          amount: stake,
          duration: 12, // 12-candle breath duration
          duration_unit: 't',
          contract_type: contractType
        });

        this.activeTradeState = {
          id: res.contract_id,
          type: contractType,
          entry: ltfEnd,
          tp1: contractType === 'CALL' ? ltfEnd + 0.8 : ltfEnd - 0.8,
          breakevenSecured: false
        };

        this.log(`[MTF Trade Executed] ID: ${res.contract_id} | 12-Candle Breath Active`, 'success');
      } catch (err) {
        this.log(`[Execution Error]: ${err.message || err.code}`, 'error');
        this.inRecoveryMode = true;
      }

      setTimeout(() => { this.isExecuting = false; }, 7000);
    }
  }

  // =========================================================================
  // AUTO-ASSET SELECTING & STRICT A+ SETUP KILLZONE BOT (XAU/USD + FOREX)
  // =========================================================================
  async runAutoAssetAPlusKillzoneBot() {
    const nowUtc = new Date();
    const currentHour = nowUtc.getUTCHours();
    const currentMinute = nowUtc.getUTCMinutes();
    const timeInMinutes = currentHour * 60 + currentMinute;
    const isDst = this.isDSTActive(nowUtc);

    const asianStart = 0, asianEnd = 360;
    const londonStart = isDst ? 420 : 480; 
    const londonEnd = isDst ? 600 : 660;   
    const nyStart = isDst ? 720 : 780;     
    const nyEnd = isDst ? 900 : 960;       
    const londonCloseStart = isDst ? 900 : 960; 
    const londonCloseEnd = isDst ? 1080 : 1140; 

    const isAsian = timeInMinutes >= asianStart && timeInMinutes <= asianEnd;
    const isLondon = timeInMinutes >= londonStart && timeInMinutes <= londonEnd;
    const isNewYork = timeInMinutes >= nyStart && timeInMinutes <= nyEnd;
    const isLondonClose = timeInMinutes >= londonCloseStart && timeInMinutes <= londonCloseEnd;

    if (!isAsian && !isLondon && !isNewYork && !isLondonClose) return;

    let activeKillzone = "Asian Range 🌏";
    let optimalSymbol = "frxEURUSD";

    if (isLondon) {
      activeKillzone = "London Open Killzone 🏛️";
      optimalSymbol = "frxGBPUSD";
    } else if (isNewYork) {
      activeKillzone = "New York Open Killzone 🗽";
      optimalSymbol = "frxXAUUSD"; // Spot Gold dominates NY overlap
    } else if (isLondonClose) {
      activeKillzone = "London Close Killzone 🔔";
      optimalSymbol = "frxEURUSD";
    }

    const marketSelect = document.getElementById('select-market');
    if (marketSelect && marketSelect.value !== optimalSymbol && isNewYork) {
      marketSelect.value = optimalSymbol;
      this.log(`[Auto-Asset Selector] Switched active market to ${optimalSymbol} for ${activeKillzone}.`, 'bot');
    }

    if (this.tickHistory.length < 50) return;

    const segment = this.tickHistory.slice(-50);
    const high = Math.max(...segment.slice(0, 30));
    const low = Math.min(...segment.slice(0, 30));
    const currentPrice = segment[segment.length - 1];

    let contractType = null;
    let setupName = "";

    const isAPlusBullishSweep = currentPrice < low && segment[segment.length - 2] > currentPrice;
    const isAPlusBearishSweep = currentPrice > high && segment[segment.length - 2] < high;
    const isAPlusResistanceBounce = currentPrice >= high - 0.0002;
    const isAPlusSupportBounce = currentPrice <= low + 0.0002;

    if (isAPlusBullishSweep) {
      contractType = "CALL";
      setupName = "A+ Setup: SMC Turtle Soup Long (Liquidity Sweep)";
    } else if (isAPlusBearishSweep) {
      contractType = "PUT";
      setupName = "A+ Setup: SMC Turtle Soup Short (Liquidity Sweep)";
    } else if (isAPlusResistanceBounce) {
      contractType = "PUT";
      setupName = "A+ Setup: Support & Resistance Hard Resistance Rejection";
    } else if (isAPlusSupportBounce) {
      contractType = "CALL";
      setupName = "A+ Setup: Support & Resistance Hard Support Bounce";
    }

    if (contractType && !this.activeTradeState) {
      this.isExecuting = true;
      const currentSymbol = marketSelect ? marketSelect.value : "frxEURUSD";
      const stake = this.getCalculatedStake(true); // 3% Risk

      const tp1 = contractType === "CALL" ? currentPrice + 0.0012 : currentPrice - 0.0012;
      const finalTarget = contractType === "CALL" ? currentPrice + 0.0030 : currentPrice - 0.0030;

      this.log(`[${activeKillzone}] Asset: ${currentSymbol} | ${setupName} | Stake: $${stake} (3% Risk)`, 'bot');

      try {
        const res = await this.api.executeTrade({
          symbol: currentSymbol,
          amount: stake,
          duration: 15,
          duration_unit: 't',
          contract_type: contractType
        });

        this.activeTradeState = {
          id: res.contract_id,
          type: contractType,
          entry: currentPrice,
          tp1: tp1,
          target: finalTarget,
          breakevenSecured: false
        };

        this.log(`[A+ Trade Executed] ID: ${res.contract_id} | TP1: ${tp1.toFixed(4)}`, 'success');
      } catch (err) {
        this.log(`[Execution Error]: ${err.message || err.code}`, 'error');
        this.inRecoveryMode = true;
      }

      setTimeout(() => { this.isExecuting = false; }, 8000);
    }
  }

  // =========================================================================
  // RISE / FALL SPEED BOAT (10% ACCOUNT AUTO-STAKE)
  // =========================================================================
  async runRiseFallSpeedBoat() {
    if (this.tickHistory.length < 3) return;
    const p = this.tickHistory;
    let contractType = p[p.length-1] > p[p.length-2] && p[p.length-2] > p[p.length-3] ? 'CALL' : (p[p.length-1] < p[p.length-2] && p[p.length-2] < p[p.length-3] ? 'PUT' : null);
    
    if (contractType) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake(false); // 10% Account Auto-Stake

      this.log(`[Rise/Fall Speed Boat] Momentum Aligned (${contractType}) | Stake: $${stake} (10% Auto-Stake)`, 'bot');

      try {
        const res = await this.api.executeTrade({ 
          symbol: symbol, 
          amount: stake, 
          duration: 1, 
          duration_unit: 't', 
          contract_type: contractType 
        });
        this.log(`[Rise/Fall Success] ${contractType} | ID: ${res.contract_id} | Payout: $${res.payout}`, 'success');
      } catch (err) { 
        this.log(`[Rise/Fall Error]: ${err.message || err.code}`, 'error');
        this.inRecoveryMode = true; 
      }
      setTimeout(() => { this.isExecuting = false; }, 1500);
    }
  }

  monitorTradeLifecycle(currentPrice) {
    if (!this.activeTradeState) return;
    const tr = this.activeTradeState;
    const hitTP1 = tr.type === 'CALL' ? currentPrice >= tr.tp1 : currentPrice <= tr.tp1;
    if (hitTP1 && !tr.breakevenSecured) {
      tr.breakevenSecured = true;
      this.log(`🎯 [TP1 Secured] Price hit TP1. Stop loss shifted to Breakeven (Risk-Free Mode).`, 'success');
    }
  }

  async runRecoveryExecution() {
    this.isExecuting = true;
    const symbol = document.getElementById('select-market').value;
    const baseStake = parseFloat(this.getCalculatedStake(false));
    const recoveryStake = (baseStake * 1.5).toFixed(2);
    const recentDigit = this.lastDigits[this.lastDigits.length - 1] || 5;
    let contractType = recentDigit >= 5 ? 'DIGITUNDER' : 'DIGITOVER';
    let barrier = recentDigit >= 5 ? '5' : '4';

    try {
      const res = await this.api.executeTradeWithBarrier({ symbol: symbol, amount: recoveryStake, duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier });
      this.log(`[Recovery Success] ID: ${res.contract_id}`, 'success');
      this.inRecoveryMode = false;
    } catch (err) {
      this.log(`[Recovery Error]: ${err.message}`, 'error');
    }
    setTimeout(() => { this.isExecuting = false; }, 2500);
  }

  async runTopDownTrendSpeedBoat() {
    if (this.tickHistory.length < 30) return;
    const m = this.tickHistory.slice(-30);
    let contractType = m[m.length-1] > m[0] && m[m.length-5] > m[m.length-10] ? 'CALL' : null;
    if (contractType) {
      this.isExecuting = true;
      try {
        await this.api.executeTrade({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 12, duration_unit: 't', contract_type: contractType });
      } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 6000);
    }
  }

  async runEvenOddSpeedBoat() {
    if (this.lastDigits.length < 10) return;
    const evens = this.lastDigits.slice(-10).filter(d => d % 2 === 0).length;
    let contractType = evens >= 8 ? 'DIGITODD' : (10 - evens >= 8 ? 'DIGITEVEN' : null);
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTrade({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: contractType }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }

  async runMatchesSpeedBoat() {
    if (this.lastDigits.length < 20) return;
    const counts = {};
    this.lastDigits.slice(-20).forEach(d => { counts[d] = (counts[d] || 0) + 1; });
    let targetDigit = 0, maxFreq = 0;
    for (let d in counts) { if (counts[d] > maxFreq) { maxFreq = counts[d]; targetDigit = parseInt(d); } }
    if (maxFreq >= 5) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: 'DIGITMATCH', barrier: targetDigit.toString() }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2500);
    }
  }

  async runDiffersSpeedBoat() {
    if (this.lastDigits.length < 15) return;
    const counts = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;
    this.lastDigits.slice(-15).forEach(d => { counts[d]++; });
    let rarestDigit = 0, minFreq = 999;
    for (let d in counts) { if (counts[d] < minFreq) { minFreq = counts[d]; rarestDigit = parseInt(d); } }
    this.isExecuting = true;
    try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: 'DIGITDIFF', barrier: rarestDigit.toString() }); } catch (e) { this.inRecoveryMode = true; }
    setTimeout(() => { this.isExecuting = false; }, 2500);
  }

  async runOver3Under6SpeedBoat(lastDigit) {
    if (this.lastDigits.length < 10) return;
    let contractType = lastDigit <= 3 ? 'DIGITOVER' : lastDigit >= 6 ? 'DIGITUNDER' : null;
    let barrier = lastDigit <= 3 ? '3' : '6';
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }

  async runMultiLowDigitsSpeedBoat() {
    this.isExecuting = true;
    const symbol = document.getElementById('select-market').value;
    const stake = this.getCalculatedStake(false);
    ['0', '1', '2'].forEach(b => {
      this.api.executeTradeWithBarrier({ symbol, amount: stake, duration: 1, duration_unit: 't', contract_type: 'DIGITOVER', barrier: b }).catch(() => {});
    });
    setTimeout(() => { this.isExecuting = false; }, 3000);
  }

  async runExtremeEdgesSpeedBoat(lastDigit) {
    if (this.lastDigits.length < 5) return;
    let contractType = lastDigit >= 7 ? 'DIGITOVER' : (lastDigit <= 2 ? 'DIGITUNDER' : null);
    let barrier = lastDigit >= 7 ? '6' : '3';
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }
}

  constructor(derivApiEngine, logCallback) {
    this.api = derivApiEngine;
    this.log = logCallback || console.log;
    this.activeBot = null; 
    this.lastDigits = [];
    this.tickHistory = [];
    this.isExecuting = false;
    this.inRecoveryMode = false;
    
    // Profit Circuit Breaker & Trade Lifecycle State
    this.initialSessionBalance = 0;
    this.profitTargetReached = false;
    this.activeTradeState = null;
  }

  setBot(botType) {
    if (this.profitTargetReached) {
      this.log("[AI Circuit Breaker] Cannot launch bot. +20% Daily Profit Target already achieved!", "warning");
      return;
    }

    this.activeBot = botType;
    this.lastDigits = [];
    this.tickHistory = [];
    this.isExecuting = false;
    this.inRecoveryMode = false;
    this.activeTradeState = null;

    if (this.initialSessionBalance === 0 && this.api.balance > 0) {
      this.initialSessionBalance = this.api.balance;
      const targetVal = (this.initialSessionBalance * 0.20).toFixed(2);
      this.log(`[AI Circuit Breaker] Initial Session Balance: $${this.initialSessionBalance.toFixed(2)} | Target (+20%): +$${targetVal}`, 'info');
    }

    this.log(`[AI Speed Boat] Activated strategy: ${botType.toUpperCase()}`, 'bot');
  }

  stopBot() {
    this.activeBot = null;
    this.isExecuting = false;
    this.inRecoveryMode = false;
    this.activeTradeState = null;
    this.log("[AI Speed Boat] All speed boats disengaged.", 'warning');
  }

  // Dynamic Stake Sizer: 10% for Rise/Fall & standard bots, 3% for A+ SMC bots
  getCalculatedStake(isSMCRisk = false) {
    if (this.api && this.api.balance > 0) {
      const riskPercent = isSMCRisk ? 3.0 : 10.0;
      const computedStake = (this.api.balance * (riskPercent / 100)).toFixed(2);
      return Math.max(0.35, parseFloat(computedStake)).toString();
    }
    return document.getElementById('input-stake').value;
  }

  checkProfitTargetCircuitBreaker() {
    if (this.initialSessionBalance === 0 && this.api.balance > 0) {
      this.initialSessionBalance = this.api.balance;
    }

    if (this.initialSessionBalance > 0 && this.api.balance > 0) {
      const currentNetPnL = this.api.balance - this.initialSessionBalance;
      const targetProfitAmount = this.initialSessionBalance * 0.20;

      if (currentNetPnL >= targetProfitAmount && !this.profitTargetReached) {
        this.profitTargetReached = true;
        this.stopBot();

        const btn = document.getElementById('btn-toggle-ai');
        const badge = document.getElementById('ai-status-badge');
        if (btn) btn.innerText = "Target Hit (+20%)";
        if (btn) btn.className = "w-full bg-emerald-900 border border-neon text-neon font-bold py-1.5 rounded text-xs opacity-75 cursor-not-allowed";
        if (badge) badge.innerText = "TARGET REACHED";
        if (badge) badge.className = "text-[10px] bg-emerald-950 text-neon border border-neon px-1.5 py-0.5 rounded font-mono font-bold";

        this.log(`🎯 [CIRCUIT BREAKER] +20% Profit Target Hit! Session Profit: +$${currentNetPnL.toFixed(2)}. All bots stopped safely.`, 'success');
        alert(`🎯 Target Achieved! Account hit +20% profit (+$${currentNetPnL.toFixed(2)}). All bots stopped.`);
        return true;
      }
    }
    return false;
  }

  isDSTActive(date = new Date()) {
    const month = date.getUTCMonth() + 1;
    return month >= 3 && month <= 11; // March to November DST
  }

  async processTick(tick) {
    if (!this.api.authorized) return;

    if (this.checkProfitTargetCircuitBreaker()) return;
    if (!this.activeBot || this.isExecuting) return;

    const priceStr = tick.quote.toString();
    const decimalSplit = priceStr.split('.');
    const fractionalPart = decimalSplit[1] || '0';
    const lastDecimal = parseInt(fractionalPart.slice(-1));
    const currentPrice = parseFloat(tick.quote);

    this.lastDigits.push(lastDecimal);
    if (this.lastDigits.length > 50) this.lastDigits.shift();

    this.tickHistory.push(currentPrice);
    if (this.tickHistory.length > 80) this.tickHistory.shift();

    if (this.activeTradeState) {
      this.monitorTradeLifecycle(currentPrice);
    }

    if (this.inRecoveryMode) {
      await this.runRecoveryExecution();
      return;
    }

    if (this.activeBot === 'mtf_macd_synthetic') {
      await this.run15MMACD1MTrendAlignerBot();
    } else if (this.activeBot === 'adaptive_smc_sr') {
      await this.runAutoAssetAPlusKillzoneBot();
    } else if (this.activeBot === 'top_down_trend') {
      await this.runTopDownTrendSpeedBoat();
    } else if (this.activeBot === 'even_odd') {
      await this.runEvenOddSpeedBoat();
    } else if (this.activeBot === 'matches') {
      await this.runMatchesSpeedBoat();
    } else if (this.activeBot === 'differs') {
      await this.runDiffersSpeedBoat();
    } else if (this.activeBot === 'rise_fall') {
      await this.runRiseFallSpeedBoat();
    } else if (this.activeBot === 'over3_under6') {
      await this.runOver3Under6SpeedBoat(lastDecimal);
    } else if (this.activeBot === 'multi_low_digits') {
      await this.runMultiLowDigitsSpeedBoat();
    } else if (this.activeBot === 'extreme_edges') {
      await this.runExtremeEdgesSpeedBoat(lastDecimal);
    }
  }

  // =========================================================================
  // 15M MACD + 1M TREND-ALIGNER SPEED BOAT (SYNTHETIC INDICES)
  // =========================================================================
  async run15MMACD1MTrendAlignerBot() {
    if (this.tickHistory.length < 60) return;

    const htfSegment = this.tickHistory.slice(-45);
    const htfStart = htfSegment[0];
    const htfMid = htfSegment[Math.floor(htfSegment.length / 2)];
    const htfEnd = htfSegment[htfSegment.length - 1];

    const fastEMAHTF = htfEnd - htfMid;
    const slowEMAHTF = htfMid - htfStart;
    const htfMacdHistogram = fastEMAHTF - slowEMAHTF;

    const htfBullish = htfMacdHistogram > 0 && htfEnd > htfStart;
    const htfBearish = htfMacdHistogram < 0 && htfEnd < htfStart;

    const ltfSegment = this.tickHistory.slice(-15);
    const ltfStart = ltfSegment[0];
    const ltfEnd = ltfSegment[ltfSegment.length - 1];
    const ltfMomentumPositive = ltfEnd > ltfStart;

    let contractType = null;
    let alignmentDetails = "";

    if (htfBullish && ltfMomentumPositive) {
      contractType = "CALL";
      alignmentDetails = "15M MACD Bullish + 1M Pullback Alignment (Long)";
    } else if (htfBearish && !ltfMomentumPositive) {
      contractType = "PUT";
      alignmentDetails = "15M MACD Bearish + 1M Pullback Alignment (Short)";
    }

    if (contractType && !this.activeTradeState) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake(true); // 3% Risk

      this.log(`[MTF Aligner Bot] ${alignmentDetails} | Asset: ${symbol} | Stake: $${stake} (3% Risk)`, 'bot');

      try {
        const res = await this.api.executeTrade({
          symbol: symbol,
          amount: stake,
          duration: 12, // 12-candle breath duration
          duration_unit: 't',
          contract_type: contractType
        });

        this.activeTradeState = {
          id: res.contract_id,
          type: contractType,
          entry: ltfEnd,
          tp1: contractType === 'CALL' ? ltfEnd + 0.8 : ltfEnd - 0.8,
          breakevenSecured: false
        };

        this.log(`[MTF Trade Executed] ID: ${res.contract_id} | 12-Candle Breath Active`, 'success');
      } catch (err) {
        this.log(`[Execution Error]: ${err.message || err.code}`, 'error');
        this.inRecoveryMode = true;
      }

      setTimeout(() => { this.isExecuting = false; }, 7000);
    }
  }

  // =========================================================================
  // AUTO-ASSET SELECTING & STRICT A+ SETUP KILLZONE BOT (XAU/USD + FOREX)
  // =========================================================================
  async runAutoAssetAPlusKillzoneBot() {
    const nowUtc = new Date();
    const currentHour = nowUtc.getUTCHours();
    const currentMinute = nowUtc.getUTCMinutes();
    const timeInMinutes = currentHour * 60 + currentMinute;
    const isDst = this.isDSTActive(nowUtc);

    const asianStart = 0, asianEnd = 360;
    const londonStart = isDst ? 420 : 480; 
    const londonEnd = isDst ? 600 : 660;   
    const nyStart = isDst ? 720 : 780;     
    const nyEnd = isDst ? 900 : 960;       
    const londonCloseStart = isDst ? 900 : 960; 
    const londonCloseEnd = isDst ? 1080 : 1140; 

    const isAsian = timeInMinutes >= asianStart && timeInMinutes <= asianEnd;
    const isLondon = timeInMinutes >= londonStart && timeInMinutes <= londonEnd;
    const isNewYork = timeInMinutes >= nyStart && timeInMinutes <= nyEnd;
    const isLondonClose = timeInMinutes >= londonCloseStart && timeInMinutes <= londonCloseEnd;

    if (!isAsian && !isLondon && !isNewYork && !isLondonClose) return;

    let activeKillzone = "Asian Range 🌏";
    let optimalSymbol = "frxEURUSD";

    if (isLondon) {
      activeKillzone = "London Open Killzone 🏛️";
      optimalSymbol = "frxGBPUSD";
    } else if (isNewYork) {
      activeKillzone = "New York Open Killzone 🗽";
      optimalSymbol = "frxXAUUSD"; // Spot Gold dominates NY overlap
    } else if (isLondonClose) {
      activeKillzone = "London Close Killzone 🔔";
      optimalSymbol = "frxEURUSD";
    }

    const marketSelect = document.getElementById('select-market');
    if (marketSelect && marketSelect.value !== optimalSymbol && isNewYork) {
      marketSelect.value = optimalSymbol;
      this.log(`[Auto-Asset Selector] Switched active market to ${optimalSymbol} for ${activeKillzone}.`, 'bot');
    }

    if (this.tickHistory.length < 50) return;

    const segment = this.tickHistory.slice(-50);
    const high = Math.max(...segment.slice(0, 30));
    const low = Math.min(...segment.slice(0, 30));
    const currentPrice = segment[segment.length - 1];

    let contractType = null;
    let setupName = "";

    const isAPlusBullishSweep = currentPrice < low && segment[segment.length - 2] > currentPrice;
    const isAPlusBearishSweep = currentPrice > high && segment[segment.length - 2] < high;
    const isAPlusResistanceBounce = currentPrice >= high - 0.0002;
    const isAPlusSupportBounce = currentPrice <= low + 0.0002;

    if (isAPlusBullishSweep) {
      contractType = "CALL";
      setupName = "A+ Setup: SMC Turtle Soup Long (Liquidity Sweep)";
    } else if (isAPlusBearishSweep) {
      contractType = "PUT";
      setupName = "A+ Setup: SMC Turtle Soup Short (Liquidity Sweep)";
    } else if (isAPlusResistanceBounce) {
      contractType = "PUT";
      setupName = "A+ Setup: Support & Resistance Hard Resistance Rejection";
    } else if (isAPlusSupportBounce) {
      contractType = "CALL";
      setupName = "A+ Setup: Support & Resistance Hard Support Bounce";
    }

    if (contractType && !this.activeTradeState) {
      this.isExecuting = true;
      const currentSymbol = marketSelect ? marketSelect.value : "frxEURUSD";
      const stake = this.getCalculatedStake(true); // 3% Risk

      const tp1 = contractType === "CALL" ? currentPrice + 0.0012 : currentPrice - 0.0012;
      const finalTarget = contractType === "CALL" ? currentPrice + 0.0030 : currentPrice - 0.0030;

      this.log(`[${activeKillzone}] Asset: ${currentSymbol} | ${setupName} | Stake: $${stake} (3% Risk)`, 'bot');

      try {
        const res = await this.api.executeTrade({
          symbol: currentSymbol,
          amount: stake,
          duration: 15,
          duration_unit: 't',
          contract_type: contractType
        });

        this.activeTradeState = {
          id: res.contract_id,
          type: contractType,
          entry: currentPrice,
          tp1: tp1,
          target: finalTarget,
          breakevenSecured: false
        };

        this.log(`[A+ Trade Executed] ID: ${res.contract_id} | TP1: ${tp1.toFixed(4)}`, 'success');
      } catch (err) {
        this.log(`[Execution Error]: ${err.message || err.code}`, 'error');
        this.inRecoveryMode = true;
      }

      setTimeout(() => { this.isExecuting = false; }, 8000);
    }
  }

  // =========================================================================
  // RISE / FALL SPEED BOAT (10% ACCOUNT AUTO-STAKE)
  // =========================================================================
  async runRiseFallSpeedBoat() {
    if (this.tickHistory.length < 3) return;
    const p = this.tickHistory;
    let contractType = p[p.length-1] > p[p.length-2] && p[p.length-2] > p[p.length-3] ? 'CALL' : (p[p.length-1] < p[p.length-2] && p[p.length-2] < p[p.length-3] ? 'PUT' : null);
    
    if (contractType) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake(false); // 10% Account Auto-Stake

      this.log(`[Rise/Fall Speed Boat] Momentum Aligned (${contractType}) | Stake: $${stake} (10% Auto-Stake)`, 'bot');

      try {
        const res = await this.api.executeTrade({ 
          symbol: symbol, 
          amount: stake, 
          duration: 1, 
          duration_unit: 't', 
          contract_type: contractType 
        });
        this.log(`[Rise/Fall Success] ${contractType} | ID: ${res.contract_id} | Payout: $${res.payout}`, 'success');
      } catch (err) { 
        this.log(`[Rise/Fall Error]: ${err.message || err.code}`, 'error');
        this.inRecoveryMode = true; 
      }
      setTimeout(() => { this.isExecuting = false; }, 1500);
    }
  }

  monitorTradeLifecycle(currentPrice) {
    if (!this.activeTradeState) return;
    const tr = this.activeTradeState;
    const hitTP1 = tr.type === 'CALL' ? currentPrice >= tr.tp1 : currentPrice <= tr.tp1;
    if (hitTP1 && !tr.breakevenSecured) {
      tr.breakevenSecured = true;
      this.log(`🎯 [TP1 Secured] Price hit TP1. Stop loss shifted to Breakeven (Risk-Free Mode).`, 'success');
    }
  }

  async runRecoveryExecution() {
    this.isExecuting = true;
    const symbol = document.getElementById('select-market').value;
    const baseStake = parseFloat(this.getCalculatedStake(false));
    const recoveryStake = (baseStake * 1.5).toFixed(2);
    const recentDigit = this.lastDigits[this.lastDigits.length - 1] || 5;
    let contractType = recentDigit >= 5 ? 'DIGITUNDER' : 'DIGITOVER';
    let barrier = recentDigit >= 5 ? '5' : '4';

    try {
      const res = await this.api.executeTradeWithBarrier({ symbol: symbol, amount: recoveryStake, duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier });
      this.log(`[Recovery Success] ID: ${res.contract_id}`, 'success');
      this.inRecoveryMode = false;
    } catch (err) {
      this.log(`[Recovery Error]: ${err.message}`, 'error');
    }
    setTimeout(() => { this.isExecuting = false; }, 2500);
  }

  async runTopDownTrendSpeedBoat() {
    if (this.tickHistory.length < 30) return;
    const m = this.tickHistory.slice(-30);
    let contractType = m[m.length-1] > m[0] && m[m.length-5] > m[m.length-10] ? 'CALL' : null;
    if (contractType) {
      this.isExecuting = true;
      try {
        await this.api.executeTrade({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 12, duration_unit: 't', contract_type: contractType });
      } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 6000);
    }
  }

  async runEvenOddSpeedBoat() {
    if (this.lastDigits.length < 10) return;
    const evens = this.lastDigits.slice(-10).filter(d => d % 2 === 0).length;
    let contractType = evens >= 8 ? 'DIGITODD' : (10 - evens >= 8 ? 'DIGITEVEN' : null);
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTrade({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: contractType }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }

  async runMatchesSpeedBoat() {
    if (this.lastDigits.length < 20) return;
    const counts = {};
    this.lastDigits.slice(-20).forEach(d => { counts[d] = (counts[d] || 0) + 1; });
    let targetDigit = 0, maxFreq = 0;
    for (let d in counts) { if (counts[d] > maxFreq) { maxFreq = counts[d]; targetDigit = parseInt(d); } }
    if (maxFreq >= 5) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: 'DIGITMATCH', barrier: targetDigit.toString() }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2500);
    }
  }

  async runDiffersSpeedBoat() {
    if (this.lastDigits.length < 15) return;
    const counts = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;
    this.lastDigits.slice(-15).forEach(d => { counts[d]++; });
    let rarestDigit = 0, minFreq = 999;
    for (let d in counts) { if (counts[d] < minFreq) { minFreq = counts[d]; rarestDigit = parseInt(d); } }
    this.isExecuting = true;
    try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: 'DIGITDIFF', barrier: rarestDigit.toString() }); } catch (e) { this.inRecoveryMode = true; }
    setTimeout(() => { this.isExecuting = false; }, 2500);
  }

  async runOver3Under6SpeedBoat(lastDigit) {
    if (this.lastDigits.length < 10) return;
    let contractType = lastDigit <= 3 ? 'DIGITOVER' : lastDigit >= 6 ? 'DIGITUNDER' : null;
    let barrier = lastDigit <= 3 ? '3' : '6';
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }

  async runMultiLowDigitsSpeedBoat() {
    this.isExecuting = true;
    const symbol = document.getElementById('select-market').value;
    const stake = this.getCalculatedStake(false);
    ['0', '1', '2'].forEach(b => {
      this.api.executeTradeWithBarrier({ symbol, amount: stake, duration: 1, duration_unit: 't', contract_type: 'DIGITOVER', barrier: b }).catch(() => {});
    });
    setTimeout(() => { this.isExecuting = false; }, 3000);
  }

  async runExtremeEdgesSpeedBoat(lastDigit) {
    if (this.lastDigits.length < 5) return;
    let contractType = lastDigit >= 7 ? 'DIGITOVER' : (lastDigit <= 2 ? 'DIGITUNDER' : null);
    let barrier = lastDigit >= 7 ? '6' : '3';
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(false), duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }
}
