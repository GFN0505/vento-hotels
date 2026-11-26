# Where to host Vento Hotels

*Research brief for the owner, 26 November 2026. Prices and regions change. Check each provider's live pricing page before signing up. Items marked **(unverified)** came from one source or a third-party site.*

> **Outcome:** the owner chose Contabo servers that we run ourselves, not the managed platform recommended below ([decision 0026](../decisions/0026-hosting-on-contabo.md), runbook in [ops/deploy.md](../ops/deploy.md)). The latency and NDPA findings still apply.

## 1. Recommendation

**Host on Render in Frankfurt, with Cloudflare in front. DigitalOcean in Amsterdam is the runner-up.** Vento needs managed services, deploys from GitHub, a full copy of the app for every pull request, and a database with point-in-time restore. Of the options here, Render covers all four with the least setup. Its [preview environments](https://render.com/docs/preview-environments) give each pull request its own database, which can load the demo group on first deploy. Its Postgres keeps [7 days of point-in-time restore on the Pro plan](https://render.com/pricing). The fixed cost at pilot scale is roughly **$90–125 a month**. Europe also turned out to be faster from Lagos than South Africa (section 4). Frankfurt adds about 15 ms over Amsterdam, which staff won't notice on a mobile connection.

DigitalOcean is the runner-up. It costs less (about $65–85 a month), Amsterdam is the fastest region we measured, and it routes `/api` and `/rpc` by path out of the box. Pull-request previews there need a GitHub Action that we would maintain ourselves, and they don't get their own database automatically. If Render's price or reliability disappoints during the pilot, moving to DigitalOcean is about a day's work, because both run plain Node and plain Postgres.

## 2. The serious options compared

Latency figures are average pings from a Lagos server ([WonderNetwork, checked 26 Nov 2026](https://wondernetwork.com/pings/Lagos)). Costs cover production (2 small API instances and a small Postgres with backups) plus staging, in US dollars per month.

| | **Render** | **DigitalOcean App Platform** | **Fly.io** | **Railway** | **AWS (London or Cape Town + Lagos Local Zone)** | **Nigerian cloud (Layer3, Nobus, MTN Cloud)** |
|---|---|---|---|---|---|---|
| Nearest usable region | Frankfurt ([regions](https://render.com/docs/regions)); no Africa | Amsterdam or London ([availability](https://docs.digitalocean.com/products/app-platform/details/availability/index.html.md)) | Amsterdam or London (Johannesburg has no managed Postgres, [regions](https://docs.fly.io/reference/regions)) | EU West, Amsterdam (unverified) | London; Cape Town; Lagos Local Zone ([AWS](https://aws.amazon.com/about-aws/whats-new/2023/01/aws-local-zones-lagos-lima-queretaro/)) | Lagos |
| Latency from Lagos | ~115 ms | ~98–106 ms | ~98–106 ms | ~98 ms | London ~106 ms, Cape Town ~253 ms | in-country, likely under 30 ms (unverified) |
| Managed Postgres + PITR | Yes, 7 days on Pro | Yes, daily backups + 7-day PITR, Postgres 15–18 ([docs](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/)) | Yes, HA + PITR from the $38 Basic plan ([pricing](https://fly.io/pricing.md)) | Template database. We would set up backups ourselves ([comparison](https://hostim.dev/hosting/alternatives/railway-vs-render/)) | RDS, the strongest. The Local Zone's RDS support is unconfirmed | Claimed by vendors ([Layer3](https://www.layer3.cloud/platform-as-a-service)), unproven |
| Preview per pull request | Built in, with its own database and seed | GitHub Action we maintain ([docs](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/)) | GitHub Action we maintain ([guide](https://fly.io/docs/blueprints/review-apps-guide)) | Built in | We build it | We build it |
| Same-origin routing | API serves the web app (see section 5) | Native path routes per component | API serves the web app | API serves the web app | Load balancer rules | We build it |
| Rough monthly cost | $90–125 | $65–85 | $70–100 | $40–70 (unverified) | $150+ plus engineering time | Unknown; quotes needed |
| Lock-in | Low (one YAML file) | Low | Low | Low | Medium | Medium |
| Main gotcha | Pro plan ($25) needed for full previews; HA Postgres costs extra | Previews are DIY | More hands-on; LISTEN/NOTIFY needs the direct database address ([client config](https://fly.io/docs/mpg/client-configuration/)) | Weakest database safety story | Needs an ops person | No GitHub deploys, previews or proven restore tooling |

Ruled out for now:
- **Google Cloud (Johannesburg) and Azure (South Africa North):** slower from Lagos than Europe (~161 ms to Johannesburg), and both need an ops person.
- **Koyeb and Northflank:** capable, but neither beats Render on previews or DigitalOcean on price, and both are smaller vendors.
- **Neon and Supabase as the database:** their default connection poolers drop the long-lived connection pg-boss listens on. Neon says LISTEN/NOTIFY needs a direct, non-pooled connection ([Neon](https://neon.com/guides/pub-sub-listen-notify)). Neon's branch-per-pull-request feature is tempting, but it adds a vendor we don't need.

## 3. NDPA 2023: can guest data live outside Nigeria?

**Short answer: yes, with safeguards. The NDPA has no general rule that data must stay in Nigeria.** Two narrower rules do require local hosting, and neither applies to a hotel system as we've designed it. This is not legal advice. A Nigerian data-protection lawyer should confirm it before the first paying customer.

- **Hosting abroad is a "transfer."** Section 41 forbids sending personal data out of Nigeria unless the destination gives adequate protection or a section 43 exception applies. Storing data on a foreign cloud counts ([INPLP on ss. 41–43](https://www.inplp.com/publications/cross-border-data-transfer-navigating-compliance-under-the-nigerian-data-protection-act-2023); [Kiet Law](https://www.kietlaw.com/blog/cross-border-data-transfers-from-nigeria)). The Act text is [here](https://cert.gov.ng/ngcert/resources/Nigeria_Data_Protection_Act_2023.pdf).
- **How adequacy is shown (s. 42):** through the destination's law, binding corporate rules, contractual clauses, codes of conduct or certification. The NDPC hasn't published an adequacy list yet ([Legal500](https://www.legal500.com/intelligence/nigeria/privacy/cross-border-data-transfers-and-international-compliance-legal-opportunities-in-global-tech-transactions)). The old NITDA whitelist was set aside in 2023 (Kiet Law).
- **Consent (s. 43)** is a narrow fallback, not a basis for running a whole system abroad (Kiet Law).
- **GAID 2025** ([NDPC text](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf), in force since 19 September 2025 per [Digital Policy Alert](https://digitalpolicyalert.org/change/13271)) sets out the transfer rules in Article 45 and Schedule 5. According to Kiet Law, it treats cross-border transfers as high-risk, so a **data protection impact assessment** is needed before the transfer. Each foreign recipient must also appear in the record of processing, and the privacy notice must name the countries. Whether the impact assessment must be *filed* with the NDPC is **unverified**.
- **National Cloud Policy 2025:** in-country hosting is required for sovereign and government data (levels 3–4). NITDA can designate private-sector data as sovereign, and its category list isn't final ([NITDA policy](https://nitda.gov.ng/wp-content/uploads/2025/10/National-Cloud-Policy-2025-Oct2-2025.pdf); [TechCabal](https://techcabal.com/2026/08/10/nigeria-pushes-local-cloud-as-85-of-workloads-use-public-clouds/)). Ordinary hotel guest data isn't in it today. **Watch this one.**
- **CBN payment-data circular (15 June 2026):** licensed payment operators must store payment transaction data in Nigeria by 1 January 2027 ([Nairametrics](https://nairametrics.com/2026/11/06/cbns-january-2027-data-localisation-deadline-puts-banks-fintechs-under-pressure/); [Mondaq](https://www.mondaq.com/nigeria/financial-services/1812264/cbns-data-localisation-directive-compliance-considerations-for-payment-system-participants)). This binds Paystack, not us. We are not a payment operator, and card data never reaches our servers.

**What we have to do:**
1. Keep all data in one place with strong law: the EU. That means Render Frankfurt, R2 buckets in the EU jurisdiction, and Sentry's EU region. EU law meets the s. 42 criteria, though that's our assessment, not an NDPC ruling.
2. Sign a data processing agreement with each hotel group (they are the controller, we are the processor). It should list our sub-processors and their countries, and include transfer clauses.
3. Sign the hosting providers' own data processing agreements.
4. Write one transfer impact assessment and keep it current.
5. Add the countries to the privacy notice template.
6. Keep the existing safeguards: guest ID numbers encrypted and masked, and ID images in a private bucket behind short-lived links.

## 4. Latency: Europe beats South Africa from Lagos

Average pings from a Lagos server, all checked on 26 November 2026 ([WonderNetwork](https://wondernetwork.com/pings/Lagos)):

| Destination | Average |
|---|---|
| Amsterdam | 98 ms |
| Accra | 100 ms |
| London | 106 ms |
| Paris | 107 ms |
| Frankfurt | 115 ms |
| Johannesburg | 162 ms |
| Nairobi | 190 ms |
| Cape Town | 253 ms |
| Washington | 181 ms |

- **South Africa is slower despite being in Africa.** The likely reason is that much West Africa–South Africa traffic still goes through Europe (our inference, not a cited fact). Other sources disagree: an older reverse measurement shows Johannesburg to Lagos at about 73 ms ([WonderNetwork](https://wondernetwork.com/pings/Johannesburg)). So results vary by network and direction.
- **Hosting in Lagos** would cut each round trip to a few tens of milliseconds. We found no managed provider with proven backups and GitHub deploys there.
- **What it means in practice:**
  - Staff phones on MTN or Airtel add their own delay on top of these figures.
  - Each request to Frankfurt costs roughly a tenth of a second plus that mobile delay.
  - The app's static files come from Cloudflare's Lagos data centre ([Cloudflare](https://blog.cloudflare.com/lagos)), so pages open locally and only data calls go to Europe.
  - The offline queue already hides slow saves at the front desk and POS.
  - **Measure from real hotels during the pilot.** If a save routinely takes over a second, revisit local hosting.

## 5. Proposed setup on Render

**What runs where**
- **Domain and edge:** DNS on Cloudflare, proxied. Cloudflare caches the hashed web files (`/assets/*`) at its Lagos edge. `/api` and `/rpc` are never cached.
- **One Render web service in Frankfurt.** It runs the Node API with the pg-boss workers and also serves the built web app for every path that isn't `/api` or `/rpc`. One service makes the address the same for everything automatically (decision 0019 allows this). Production runs 2 instances. Both run jobs, because pg-boss shares work safely. When load grows, a separate worker with `JOBS_ENABLED=false` on the web side splits them with no code change (decision 0025).
- **Postgres:** Render Postgres in Frankfurt, version 17 or 18 (confirm 18 is offered). pg-boss gets a normal direct connection. Migrations run as Render's pre-deploy step.
- **Files:** Cloudflare R2, with separate production, staging and preview buckets in the EU jurisdiction. Guest IDs go in the private bucket.
- **Monitoring:** Sentry in its EU region, plus a free uptime check on `/health`, which already reports stopped workers.

**Environments**
- **Preview:** Render creates one for each pull request, with a small database seeded with the Kora demo group on first deploy. It is deleted when the pull request closes, or after 3 days without commits.
- **Staging:** deploys automatically when a pull request merges to `main`. Migrations are rehearsed here first.
- **Production:** deploys only when the owner presses deploy (or tags a release) after checking staging.

**Backups and the monthly restore test**
- Render keeps 7 days of point-in-time restore.
- A nightly job also copies a compressed database dump to a separate R2 bucket and keeps it 90 days. This copy is outside Render, so we can recover even if the account itself has a problem.
- **On the first Monday of each month:**
  1. Restore last night's state into a fresh database.
  2. Point a staging copy at it.
  3. Check that sign-in works, row counts match, and the night audit history is intact.
  4. Note how long the restore took and record the result in `docs/`.
  5. A GitHub Action reminds us and runs the checks.

**Rough monthly cost (pilot)**
| Item | USD |
|---|---|
| Render Pro workspace | 25 |
| Production API, 2 × 0.5 CPU / 512 MB (move to 1 CPU / 2 GB at $25 each if memory is tight) | 14–50 |
| Production Postgres, 1 GB RAM + ~20 GB storage | 25 |
| Staging API + small Postgres | 13–26 |
| Preview environments (billed by the second while open) | 5–15 |
| Cloudflare free plan, R2 (first 10 GB free), Sentry developer plan, uptime check | 0–10 |
| **Total** | **≈ 90–125** |

High-availability Postgres (a standby that takes over automatically) is the first upgrade worth paying for once real hotels depend on it. Its price is **unverified** and roughly doubles the database line. At dozens of groups, expect $300–600 a month before HA. That's still inside Render's normal plans.

## 6. Risks and open questions for the owner

1. **Legal sign-off.** A Nigerian data-protection lawyer should confirm the section 3 reading. We also need to know whether Vento itself must register with the NDPC as a data controller or processor of major importance.
2. **Customers who demand in-country hosting.** For example, a state-owned hotel, or a group that NITDA's sovereign-data list later covers. Our answer would be a dedicated Lagos deployment for that customer, priced separately. Should we say so up front?
3. **Paying in dollars.** Every option bills in USD by card. Nigerian naira cards often have low foreign-spend limits. Which card or domiciliary account will pay the hosting bills?
4. **Single region.** If Frankfurt goes down, Vento goes down. The offline mode keeps front desk and POS taking work, but online booking and reports stop. Is that acceptable for the pilot, with a cross-region standby added later?
5. **Real-world speed.** The latency figures come from a Lagos server, not a hotel's phone. We'll measure at pilot hotels in the first month.
6. **Price drift.** Render and DigitalOcean have both changed prices in the past. We'll re-check this page on sign-up day and review costs each quarter.
7. **Choice of domain** for production and staging, needed before setup starts.
