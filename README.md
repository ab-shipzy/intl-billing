# ShipzyCart International Billing Dashboard (Java)

Admin backend + customer portal for international shipment billing. **Pure JDK 21** — `com.sun.net.httpserver` + SQLite (sqlite-jdbc) + org.json. No Spring, no Maven, no build tool: dependencies are vendored jars in `lib/`, compiled with plain `javac`.

## URLs
- `/` — Customer portal (login with customer code + password)
- `/admin` — Admin dashboard

## Modules (MVP)
1. **Customer onboarding** — create customer code + portal password, edit, activate/deactivate
2. **Consignee database** — reusable consignees, optionally linked to a customer, one-click fill in shipment form
3. **Shipment billing** — new billing item with:
   - Customer selector, provider + service dropdowns (from Settings), AWB, date, status
   - From location (address, country, pincode)
   - To location (consignee pick or manual: company, name, address, country, phone)
   - Multiple box categories (count × L×W×H × wt/box, divisor 5000/4000/6000) → live actual / volumetric / **chargeable weight**
   - Invoice no/date/value/currency, Inco terms, LUT / IGST
   - Rate ₹/kg → auto amount (rate × chargeable wt), editable override
   - **Shipment drawer**: full detail view + document repository (multi-file upload as base64 JSON, download, delete)
4. **Settings** — service providers and their services (seeded: FedEx, DHL, UPS, Aramex, Self - Dedicate Master)

Customer portal shows only: date, AWB, carrier, from, to, box count, chargeable weight, rate, amount, status. Row click → drawer with full details + document downloads. Customers see only shipments on their own code; downloads are ownership-checked.

## Local run
```bash
javac -cp "lib/*" -d out src/*.java
java -cp "out:lib/*" App        # http://localhost:3000
```
(Windows: classpath separator is `;` — `java -cp "out;lib/*" App`)

Default admin: `admin` / `shipzy@2026` (change via env).

## Push to GitHub
Repo is already git-initialized and committed. From this folder:
```bash
git remote add origin https://github.com/ab-shipzy/shipzy-intl-billing.git
git branch -M main
git push -u origin main
```
(Create the empty repo on github.com first, no README/gitignore.)

## Railway deploy
1. Railway → New Project → Deploy from GitHub repo → select `shipzy-intl-billing`. Dockerfile is auto-detected.
2. **Add a Volume** mounted at `/data` (SQLite DB + uploaded documents — mandatory, else data is lost on redeploy).
3. Environment variables:
   - `DATA_DIR=/data`
   - `SECRET=<long random string>` (session cookie signing)
   - `ADMIN_USER=<username>`
   - `ADMIN_PASS=<strong password>`
4. Custom domain: Settings → Networking → Custom Domain → e.g. `billing.shipzy.in`, then add the CNAME record at your DNS.

## Structure
```
src/App.java        HTTP server, routing, all API handlers, SQLite schema
src/Auth.java       HMAC session tokens + PBKDF2 password hashing (JDK crypto)
lib/                sqlite-jdbc-3.36.0.3.jar (GitHub release) + json.jar (org.json, compiled from source)
public/admin.html   Admin dashboard (vanilla JS, single file)
public/index.html   Customer portal (vanilla JS, single file)
Dockerfile          Two-stage: javac build → JRE runtime
railway.json        Railway Dockerfile builder config
```

## Notes
- Chargeable weight = max(Σ actual, Σ volumetric); volumetric per row = count × (L×W×H)/divisor
- Customer codes stored uppercase; login is case-insensitive
- Passwords PBKDF2-hashed (120k iterations, SHA-256); sessions are HMAC-signed httpOnly cookies (12h)
- Document upload: base64 JSON, ≤15 MB per file, ≤10 files per upload
- SQLite access is serialized on a single connection — fine for an internal/small-customer tool
