/*
 * aWATTar HOURLY -> Shelly Live Electricity Tariff
 *
 * For Shelly Gen2+/Gen3 devices with the Scripting feature, including
 * Shelly 3EM-63 Gen3. Fetches the current Austrian aWATTar spot price,
 * calculates a configurable variable end-user price, and posts it to
 * Shelly's Live tariff endpoint.
 *
 * Never share or commit your personal Shelly Live tariff URL: it contains
 * a bearer token. Paste it only into the device-local copy of this script.
 */

let CONFIG = {
  awattar_url: "https://api.awattar.at/v1/marketdata",

  // Paste the full tokenized URL copied from Shelly App > Electricity Tariff
  // > Live. This value is intentionally a placeholder in this repository.
  shelly_live_tariff_url: "PASTE_YOUR_TOKENIZED_SHELLY_LIVE_TARIFF_URL_HERE",

  // aWATTar HOURLY components, all net (EUR/kWh).
  procurement_eur_kwh: 0.015,
  // Legacy plans used |spot price| x 3%. Current plans may use 0.00.
  balancing_rate: 0.00,

  // Example variable Austrian charges from an October 2025 Vienna invoice.
  // Change every value to match your own invoice, network operator and tariff.
  grid_usage_eur_kwh: 0.074,
  grid_loss_eur_kwh: 0.007,
  electricity_tax_eur_kwh: 0.015,
  eco_work_eur_kwh: 0.0074,
  eco_loss_eur_kwh: 0.0006,
  usage_tax_rate: 0.06,
  vat_rate: 0.20,

  // Wait briefly after the hour boundary for the new market record to exist.
  hour_offset_seconds: 5
};

function getUnixTime() {
  let sys = Shelly.getComponentStatus("sys");
  if (sys === null || sys.unixtime === null) return null;
  return sys.unixtime;
}

function scheduleNextUpdate() {
  let now = getUnixTime();
  if (now === null) {
    print("ERROR: System time is not synchronized; retrying in 60 seconds.");
    Timer.set(60000, false, updateTariff);
    return;
  }
  let nextHour = (Math.floor(now / 3600) + 1) * 3600 + CONFIG.hour_offset_seconds;
  let delaySeconds = nextHour - now;
  if (delaySeconds < 1) delaySeconds = 1;
  print("Next tariff update in", delaySeconds, "seconds");
  Timer.set(delaySeconds * 1000, false, updateTariff);
}

function calculateFinalPrice(marketPriceEurMWh) {
  let spot = marketPriceEurMWh / 1000.0;
  let balancing = Math.abs(spot) * CONFIG.balancing_rate;
  let energyNet = spot + balancing + CONFIG.procurement_eur_kwh;
  let gridNet = CONFIG.grid_usage_eur_kwh + CONFIG.grid_loss_eur_kwh;
  let usageTax = (energyNet + gridNet) * CONFIG.usage_tax_rate;
  let otherCharges = CONFIG.electricity_tax_eur_kwh + CONFIG.eco_work_eur_kwh + CONFIG.eco_loss_eur_kwh;
  let totalGross = (energyNet + gridNet + usageTax + otherCharges) * (1.0 + CONFIG.vat_rate);

  print("--------");
  print("aWATTar energy:", energyNet, "EUR/kWh net");
  print("Grid:", gridNet, "EUR/kWh net");
  print("Usage tax:", usageTax, "EUR/kWh net");
  print("Other charges:", otherCharges, "EUR/kWh net");
  print("TOTAL:", totalGross, "EUR/kWh gross");
  print("--------");
  return totalGross;
}

function onShellyPost(result, errorCode, errorMessage) {
  if (errorCode !== 0) {
    print("ERROR posting tariff to Shelly:", errorCode, errorMessage);
  } else if (result === null) {
    print("ERROR: Empty response from Shelly.");
  } else {
    print("Shelly response:", result.code, result.body);
    if (result.code >= 200 && result.code < 300) print("Tariff successfully updated.");
    else print("WARNING: Shelly returned HTTP", result.code);
  }
  scheduleNextUpdate();
}

function sendToShelly(price) {
  if (CONFIG.shelly_live_tariff_url.indexOf("PASTE_") === 0) {
    print("ERROR: Configure shelly_live_tariff_url before starting this script.");
    scheduleNextUpdate();
    return;
  }
  let roundedPrice = Math.round(price * 1000000) / 1000000;
  let body = JSON.stringify({ price: roundedPrice });
  print("Posting tariff price:", body);
  Shelly.call("HTTP.POST", {
    url: CONFIG.shelly_live_tariff_url,
    content_type: "application/json",
    body: body,
    timeout: 15
  }, onShellyPost);
}

function onAwattarResponse(result, errorCode, errorMessage) {
  if (errorCode !== 0) {
    print("ERROR requesting aWATTar:", errorCode, errorMessage);
    scheduleNextUpdate();
    return;
  }
  if (result === null || result.code !== 200) {
    print("ERROR: aWATTar HTTP response:", result === null ? "null" : result.code);
    scheduleNextUpdate();
    return;
  }
  let data;
  try { data = JSON.parse(result.body); }
  catch (e) { print("ERROR parsing aWATTar JSON:", e); scheduleNextUpdate(); return; }
  if (data === null || data.data === undefined || data.data.length === 0) {
    print("ERROR: No aWATTar price data received.");
    scheduleNextUpdate();
    return;
  }
  let now = getUnixTime();
  if (now === null) { print("ERROR: System time unavailable."); scheduleNextUpdate(); return; }
  let nowMs = now * 1000;
  let marketPrice = null;
  for (let i = 0; i < data.data.length; i++) {
    let item = data.data[i];
    if (nowMs >= item.start_timestamp && nowMs < item.end_timestamp) {
      marketPrice = item.marketprice;
      break;
    }
  }
  if (marketPrice === null) {
    print("ERROR: No aWATTar entry found for current time.");
    scheduleNextUpdate();
    return;
  }
  print("Current aWATTar market price:", marketPrice, "EUR/MWh");
  sendToShelly(calculateFinalPrice(marketPrice));
}

function updateTariff() {
  print("");
  print("=== Updating aWATTar tariff ===");
  Shelly.call("HTTP.GET", { url: CONFIG.awattar_url, timeout: 15 }, onAwattarResponse);
}

print("aWATTar -> Shelly tariff script started.");
updateTariff();

