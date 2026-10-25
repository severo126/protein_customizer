# Getting the three credentials

Nano Foundry runs with none of these. Each one turns a panel from "not configured, here is what
it would have done" into the live thing. Nothing here is needed to demo the catalogue, the bench,
the splice funnel or the vacuum.

Copy `.env.example` to `.env` at the repo root and fill it in. `.env` is gitignored, and
`./deploy/bring-up.sh` sources it automatically, so no key ever needs to be pasted into a command
twice or committed.

```sh
# .env — never commit this
export VULTR_API_KEY=...
export SERPAPI_KEY=...
export DATABASE_URL=postgres://tsdbadmin:...@....tsdb.cloud.timescale.com:31234/tsdb?sslmode=require
```

---

## 1. Vultr — hosting the app, the database and the sweep worker

**Why:** `./deploy/bring-up.sh --vultr` uses it to create the instance that serves the app and holds
the Postgres. This is also what the `.tech` domain would point at.

1. Sign in at [my.vultr.com](https://my.vultr.com) (a card on file is required before an instance
   can be created; the smallest plan the script uses, `vc2-1c-2gb`, is a few dollars a month, and
   you can destroy it after judging).
2. Open **Account → API**, under the **OTHER** heading
   ([docs](https://docs.vultr.com/platform/other/api/enable-user-api-access.md)).
3. Click **Enable API** under **Personal Access Token**, then copy the token.
4. On that same API page, check whether an access-control or allowed-IP list is shown. Vultr can
   restrict which addresses may use the token; if your first call comes back `403`, that list is
   the first thing to look at — add the address you are calling from (and the instance's own
   address if you later call the API from it).

**Use it:**

```sh
export VULTR_API_KEY=...
./deploy/bring-up.sh --vultr
```

It creates the instance, waits for an address, and prints it. `deploy/cloud-init.yaml` then installs
Node, Python and TimescaleDB on the box, clones the repo, applies the schema, starts both services
behind nginx and seeds the funnel history. Optional overrides: `VULTR_REGION` (default `dfw`,
Dallas, closest to Austin), `VULTR_PLAN`, `VULTR_OS_ID`, `VULTR_LABEL`, and `REPO_REF` (the
branch the box clones, default `main`).

The repo is private, so the box needs a way to clone it: either make the repo public, or set
`GITHUB_TOKEN` to a fine-grained personal access token with read-only Contents access to this repo
(GitHub → Settings → Developer settings → Fine-grained tokens). It travels only in the instance's
user data. The box clones `main` explicitly, whatever GitHub's default branch is.

If `DATABASE_URL` and `SERPAPI_KEY` are set when you run it, they are written to
`/etc/nano-foundry.env` on the instance (mode 0600, via its user data, never the repo). The app then
uses your Tiger Cloud service instead of the box's local TimescaleDB, and the schema is applied to
it on first boot. The URL is written with `sslmode=no-verify`: a free-tier Tiger service has a
self-signed certificate, and Node's pg driver would otherwise reject it. The connection stays
encrypted but the server's identity is not checked, which is acceptable for a demo box only.

The box's firewall (ufw, on by default on Vultr's Ubuntu image) is opened for ports 80 and 443.

**Check it worked:** `curl http://<ip>/api/room` returns JSON, and `http://<ip>/` serves the app.

---

## 2. SerpApi — the citation trail on every catalogue card

**Why:** the *Go and check the real biochemistry* button. The key is held server-side by our own
API, never in the browser.

1. Sign up at [serpapi.com/users/sign_up](https://serpapi.com/users/sign_up). There is a free tier
   with a small monthly search allowance, which is far more than a demo needs — see
   [pricing](https://serpapi.com/pricing) for the current numbers.
2. Copy the key from [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key).

**Use it:**

```sh
SERPAPI_KEY=... node tools/api/server.mjs       # or export it before ./deploy/bring-up.sh
```

**Check it worked:**

```sh
curl 'localhost:5173/api/sources?q=Lipase'
```

`"configured": false` means the key is not reaching the server. `"configured": true` with a
`results` array means the panel is live — open any catalogue card and press the button.

The app queries Google Scholar through SerpApi for the enzyme's name. We do not read or vouch for
what comes back, and the panel says so.

---

## 3. Timescale (Tiger Data) — the hypertable behind the live panel

**Why:** the "what the room has been building" panel on the bench, the continuous aggregates, and
the funnel history. Without it the events buffer to `data/events.jsonl` and the panel says so.

1. Sign up at [tigerdata.com](https://www.tigerdata.com) and open the Tiger Console.
2. Click **New service**. Choose compute and region (**Shared** is the free compute option; pick a
   region near Austin), then **Continue**.
3. Choose **Development**, then **Continue**. Name it `nano-foundry` and click **Create service**
   ([docs](https://www.tigerdata.com/docs/get-started/quickstart/create-service)).
4. Under **Download your database config**, click **Download the config** and keep the file. The
   docs are explicit: *"This is the only time you can access your service's password."* If you lose
   it you reset the password rather than recover it.
5. The downloaded config has the host, port, user (`tsdbadmin`), password and database name. Build
   the URL from them:

   ```
   postgres://tsdbadmin:<password>@<host>:<port>/tsdb?sslmode=require
   ```

**Apply the schema once:**

```sh
psql "$DATABASE_URL" -f tools/api/schema.sql
```

That creates `foundry_events`, turns it into a hypertable, and adds the two continuous aggregates
the live panel reads.

**Use it:**

```sh
export DATABASE_URL=postgres://tsdbadmin:...@...:31234/tsdb?sslmode=require
npm install pg          # the only npm dependency in the project, and only for this
node tools/api/server.mjs
```

The server prints `Event store: Timescale hypertable` when it is talking to the database, and
`falling back to data/events.jsonl` when it is not — so you never have to guess which one the panel
is showing.

**Check it worked:**

```sh
node tools/sweep.mjs --pairs 60
curl localhost:5173/api/room
```

The `note` field says which store answered. With Timescale connected it reads *"Live from a
Timescale hypertable, via five-minute continuous aggregates."*

---

## Not a credential, but on the same list

**The `.tech` domain.** Register one at [get.tech](https://get.tech) — `nanofoundry.tech` is the
name I would take — and add an **A record** pointing at the Vultr instance's address. Then replace
the placeholder line at the top of the README. HackTX usually hands out a free `.tech` voucher at
the sponsor table; worth asking before paying.

**The Gemini key** can live in either of two places. Get one at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey).

* *In the browser.* Pasted on the bench or picker screen, it stays in that browser's local storage
  and calls go straight from the browser to Google. This is the default and needs nothing on the
  server.
* *On the server.* Set `GEMINI_API_KEY` in `.env` (or `/etc/nano-foundry.env` on the Vultr box) and
  the API answers `GET /api/gemini` with `configured: true`, the key boxes disappear, and calls
  go through `POST /api/gemini`, which runs the named agent from `config/agents.json` with the
  server's key. The key is never sent to the browser. A visitor can only run a registered agent
  with the registry's model, token cap and timeout. Mind that on a public site every visitor's
  requests spend this key's quota; the free tier is rate-limited rather than billed.

A browser key, when one is set, is used in preference to the server's.
