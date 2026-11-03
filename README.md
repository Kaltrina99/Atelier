# Atelier — Boutique stock & sales

An Albanian-first, mobile-friendly stock and order manager for a Kosovo dress
boutique. Track products, brands, photos, colors, sizes, retail and wholesale
prices, stock, online/in-person orders, and customer details. Search the catalogue
by product, brand, SKU, category, or color, then filter by price, stock, and sale
type. Create new-collection announcements and send opted-in customer campaigns
through configured WhatsApp Business or Viber providers. Use the Instagram
tracker to plan posts, link them to products, and manually record post insights,
attributed orders, and sales.

The interface is hosted on GitHub Pages. Sign-in and shared store data require
the included ASP.NET API and SQL Server hosted separately; GitHub Pages cannot run
the API or database.

## Run locally

Requires Node.js 20+. The frontend runs in local-only mode by default, without
the API, SQL Server, or a login. Product, order, collection, and Instagram tracker
data are saved in this browser's IndexedDB and are not shared with other devices.
Local browser data does not automatically transfer to the shared API store; export
a JSON backup from Reports before connecting if you want to keep those records.

To start the optional local SQL Server container, set a strong password in
PowerShell before starting Compose:

```powershell
$env:MSSQL_SA_PASSWORD = "<your strong local password>"
docker compose up -d
```

```powershell
cd frontend
npm ci
npm run dev
```

When you're ready to connect the shared store, start the API and SQL Server as
described below, set `VITE_API_URL` in the frontend environment to the API's base
URL (for local development, `http://localhost:5173` uses Vite's `/api` proxy),
and restart Vite. With that setting present, secure sign-in and API-backed shared
data are enabled.

To run the API, use .NET 10 and a reachable SQL Server database.

In PowerShell, configure a signing key and the initial owner credentials before
starting the API. Keep these values in environment variables or a secret manager,
never in source control:

```powershell
$env:StoreAuth__SigningKey = "<random secret of at least 32 bytes>"
$env:StoreAuth__BootstrapEmail = "owner@example.com"
$env:StoreAuth__BootstrapPassword = "<at least 12 characters>"
$env:Database__MigrateOnStartup = "true"
dotnet run --project backend\src\Starter.Api
```

The default connection string in `backend\src\Starter.Api\appsettings.json` uses
local SQL Server. Set `ConnectionStrings__Default` to your SQL Server connection
string if needed. The first run applies the checked-in migrations and creates the
owner account. Bootstrap credentials are only used when there are no existing
store accounts.

In another PowerShell window, start the frontend as above.

Choose **SQ / EN** to switch between Albanian (the default) and English. The owner
can create staff accounts from the top bar; account registration is not public.

For production, apply database migrations as a controlled deployment step using
the .NET EF tool or a reviewed SQL migration script. Avoid running migrations
concurrently from multiple API instances:

```powershell
dotnet tool restore
dotnet ef database update --project backend\src\Starter.Api
```

## Deploy

### GitHub Pages frontend

1. Create a GitHub repository, push this project, and select **GitHub Actions** as
   the Pages build and deployment source in **Settings → Pages**.
2. Deploy the API and SQL Server separately, then configure the API's HTTPS URL,
   database connection, CORS origin, JWT signing key, and bootstrap owner secrets.
3. In the GitHub repository's **Settings → Secrets and variables → Actions →
   Variables**, add `VITE_API_URL` with the API base URL (for example
   `https://api.example.com`, without `/api`).
4. Configure the API CORS origin as the GitHub Pages site origin
   (for example `https://<account>.github.io`; do not include the repository path).
5. Push to `main` or `master`. The workflow builds and publishes the frontend.

Use the API host's secret/environment-variable settings for:

- `ConnectionStrings__Default` — production SQL Server connection.
- `StoreAuth__SigningKey` — randomly generated secret with at least 32 bytes.
- `StoreAuth__BootstrapEmail` and `StoreAuth__BootstrapPassword` — initial owner,
  with a password of at least 12 characters.
- `Cors__Origins__0` — exact HTTPS origin of the Pages site or custom domain.
- `Database__MigrateOnStartup` — normally leave `false` in production and apply
  reviewed migrations before deploying the API.
- `Messaging__Infobip__BaseUrl` and `Messaging__Infobip__ApiKey` — Infobip account
  base URL and API key.
- `Messaging__WhatsApp__Sender`, `Messaging__WhatsApp__TemplateName`, and
  `Messaging__WhatsApp__Language` — approved WhatsApp sender/template settings.
- `Messaging__Viber__Sender` — approved Viber Business sender name.

The WhatsApp marketing template must be approved and contain four positional
body variables, in order: customer name, collection name, arrival date, and
product list. Set its exact registered language code. The app only reports a
channel as ready when its required server settings are present; credentials are
never entered into or stored in the GitHub Pages frontend.

Bulk sends are restricted to the store owner and limited to 50 recipients per
request. Recipient/channel opt-in is recorded per collection; Viber promotional
sends additionally require confirmation that its non-promotional introduction
was previously sent. Provider acceptance is not delivery confirmation. Uncertain
provider outcomes are blocked from retry to reduce duplicate messages. Use the
Collections screen's opt-out controls to revoke channel consent across saved
campaign contacts. Confirm that Infobip supports
the intended +383 destinations and current pricing before sending; Viber approval
and pricing depend on destination and service.

The JWT issuer and audience default to `atelier-api` and `atelier-store`; override
them with `StoreAuth__Issuer` and `StoreAuth__Audience` if required. The initial
owner is seeded once; the owner can add staff from inside the app. Signed-in users
share the store data through SQL Server. Back up the database regularly and use
**Reports → Backup** for an additional JSON export. Imported backups replace the
current store contents.

## Accountant reports and Kosovo tax preparation

The reports page supports a selectable date range and exports the selected report
as an Excel-compatible `.xls`, Word-compatible `.doc`, or browser-generated PDF.
Available views include:

- Sales register with customer/order details and an indicative VAT estimate.
- Daily sales trends and retail/wholesale channel comparisons.
- Sales totals by retail/wholesale channel and product.
- Indicative product margins using current catalogue costs, repeat-customer rankings, and customer activity.
- Current stock by color/size, with indicative valuation from catalogue costs.
- Low-stock/replenishment suggestions, order pipeline, cancellations, and order-status summaries.
- An accountant handoff checklist identifying records the app does not capture.

These are management and bookkeeping aids, **not official ATK declarations,
invoices, fiscal receipts, or a complete accounting ledger**. The app does not
record supplier purchase invoices/input VAT, operating expenses, payment
collections, customer balances, payroll, opening stock, stock movements, or
asset depreciation. It does not submit to ATK EDI or connect to a certified fiscal
cash-register system. VAT estimates apply one configured rate to report lines;
inventory valuation uses current catalogue costs. Neither should be treated as an
official tax calculation or historical cost-of-sales figure. Ask a Kosovo
accountant to reconcile source documents, select the correct forms and accounting
treatment, and verify current deadlines and obligations with ATK before filing.

- [ATK forms](https://www.atk-ks.org/formularet/)
- [ATK legislation](https://www.atk-ks.org/en/legislation/laws/)
- [ATK fiscal cash registers](https://www.atk-ks.org/en/arkat-fiskale/)

Collections can be sent in bulk through the Infobip APIs without opening WhatsApp
or Viber. This requires an active Infobip account, approved senders, valid server
configuration, and channel-specific recipient opt-in. The app does not provide
an ATK or marketing-compliance certification.

The Instagram tracker is manual: it does not connect to Instagram or fetch
Insights automatically. Record planned or published posts, optional post links,
associated products, reach, engagement, profile visits, and attributed sales
from the Instagram app's Insights.

## Check the frontend build

```powershell
cd frontend
npm ci
npm run build
```
