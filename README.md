# aWATTar HOURLY → Shelly Live Tariff

Run this script on a compatible Shelly scripting device (tested on **Shelly 3EM-63 Gen3**) to fetch the current Austrian aWATTar HOURLY market price and update the **Shelly Live electricity tariff** automatically.

The script is deliberately device-local: no Home Assistant, server, or scheduled cloud service is required.

> **Keep your Shelly Live tariff URL private.** It contains a token that can update the tariff for your account. This repository contains only a placeholder and must remain that way.

## What it does

1. Requests aWATTar's public Austrian market-data API.
2. Selects the record covering the current hour.
3. Converts the API's `EUR/MWh` market price to `EUR/kWh`.
4. Adds your configurable aWATTar and variable network/tax costs.
5. Posts `{ "price": ... }` to Shelly Live Tariff.

## Setup

### 1. Enable Shelly Live tariff and copy its private URL

In the Shelly app, open **Electricity Tariff** and select **Live**. Enable the live tariff. The page provides an API URL for updating the price (and may label it as an API endpoint or show a copy button). Copy the **entire** URL.

Treat this URL as a password: it includes a token. Do not paste it into an issue, screenshot, chat, public repository, or configuration backup. If it is ever exposed, use **Renew token** on the same Shelly Live tariff page and update the device script.

### 2. Configure the script

Open [`awattar-live-tariff.js`](awattar-live-tariff.js). On the Shelly device, replace only this placeholder:

```javascript
shelly_live_tariff_url: "PASTE_YOUR_TOKENIZED_SHELLY_LIVE_TARIFF_URL_HERE",
```

Then review every value in the configuration block, especially the variable charges described below.

### 3. Install it on Shelly

1. Open your Shelly's **local web interface** (its local IP address).
2. Open **Scripts** and create a script.
3. Paste the configured contents of `awattar-live-tariff.js`.
4. Save it, then start it. Enable automatic start if you want it to resume after a reboot.

This requires a Shelly model/firmware with the JavaScript scripting feature. The script was tested on a Shelly 3EM-63 Gen3; Gen2+/Gen3 devices with scripting support should be suitable.

### 4. Test it

Open the script's **Console** below its editor in the local web interface and start the script. A successful run looks like:

```text
=== Updating aWATTar tariff ===
Current aWATTar market price: … EUR/MWh
TOTAL: … EUR/kWh gross
Shelly response: 200 …
Tariff successfully updated.
Next tariff update in … seconds
```

If no console output appears, enable the device's WebSocket/debug logging in its settings, then restart the script. Confirm the new price in the Shelly app's **Electricity Tariff → Live** page.

## Price calculation and Austrian examples

The aWATTar API returns the wholesale EPEX Spot price in `EUR/MWh`; the script divides it by 1,000. It then calculates:

```text
energy net = spot + |spot| × balancing rate + procurement component
usage tax  = (energy net + grid use + grid loss) × usage-tax rate
gross      = (energy net + grid use + grid loss + usage tax
              + electricity tax + eco levies) × (1 + VAT)
```

The prefilled grid, levy, and tax values are **examples only**, derived from an **October 2025 Vienna invoice**:

| Example component | Net value |
| --- | ---: |
| Grid use | 7.40 ct/kWh |
| Grid loss | 0.70 ct/kWh |
| Electricity tax | 1.50 ct/kWh |
| Eco levy—work | 0.74 ct/kWh |
| Eco levy—loss | 0.06 ct/kWh |
| Vienna usage tax | 6% |
| VAT | 20% |

They are not universal. **You must replace them with the consumption-dependent values from your own invoice, network operator, municipality, and tariff.** Fixed charges (base fee, meter fee, power fee, annual/fixed renewable contribution, etc.) are intentionally excluded because they do not vary by hourly consumption.

### Legacy 3% balancing component

Some older aWATTar HOURLY arrangements used a balancing-energy component of **3% of the absolute spot price**, in addition to the procurement component. Newer aWATTar HOURLY pricing may no longer include it. The script exposes this as:

```javascript
balancing_rate: 0.00,
```

Set it to `0.03` only if your current contract/invoice explicitly includes that legacy component; otherwise keep `0.00`. Check your own aWATTar tariff terms rather than relying on this example.

## Why the timer is one-shot and recalculated

The script updates immediately when started, then schedules a **one-shot** timer for the next full hour plus five seconds. After every success or failure, it recalculates the delay from the device's current Unix time.

This is intentional. A repeating 3,600-second timer started at 13:37 would remain misaligned at 14:37, 15:37, and so on. Recalculation keeps updates aligned after slow requests, errors, restarts, and reboots—e.g., a script started at 13:37 updates immediately and then next at 14:00:05.

## Safety and troubleshooting

- Make sure the device clock is synchronized; the script retries after one minute when time is unavailable.
- HTTP/JSON/API errors are logged and the next hour-aligned attempt is still scheduled.
- A missing placeholder replacement is detected before any Shelly request is made.
- Negative market prices are supported; the optional legacy balancing part uses the absolute spot price.

## License

MIT. See [LICENSE](LICENSE).

