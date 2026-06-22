# 🚩 CTF Answer Key — EFTSURE_FLAG tokens

> **⚠️ FACILITATOR ANSWER KEY.** The repo is private to participants, so committing is fine.
> If it ever becomes accessible, every challenge is spoiled.
>
> **✅ LIVE TOKENS:** these are the real `EFTSURE_FLAG` tokens with fresh hashes — the earlier
> placeholder values are dead. Rebuild + redeploy all affected services (and restart the collector)
> for the new values to take effect.

Telemetry backend: **Grafana Cloud** stack `hackathon.grafana.net` (gcx context `hackathon`,
namespace `ctf`). Demo runs via `make start-minimal-no-o11y`. Tokens are **static, one per
challenge, identical for all players**, submitted privately to the facilitator.

Difficulty comes from *which signal you check* and *intermittency*, not obfuscation. Only the
log challenges (#1, #2, #3) are findable by a Loki free-text search; metric/trace tokens are
invisible to log search by design.

**Token keys (vary per challenge):** non-log tokens are a span attribute (traces) or series label
(metrics). The key **differs per challenge** so no single dashboard can sweep them all:
- `incident_ref` — #2 productCatalogFailure, #5 emailMemoryLeak, #6 paymentUnreachable
- `runtime_seed` — #4 adHighCpu (metric label)
- `cache.shard_ref` — #7 recommendationCacheFailure (span attr)
- `txn.settlement_id` — #8 paymentFailure (span attr)

> **Collector side-fix:** `transform/fix_container_pct_scale` divides `container.memory.percent`
> and `container.cpu.utilization` by 100 so they're true 0-1 ratios. This corrects a `docker_stats`
> mis-scaling (values were 0-100 under a `_ratio` name → App O11y showed e.g. 4500% instead of 45%).
> All metric thresholds below are on this corrected 0-1 scale.

**🎓 #1 (`failedReadinessProbe`) is the live-demo flag and is NOT scored — it's used in the facilitator
walkthrough. #2–#8 are the 7 scored challenges.**

| # | Tier | Feature flag | Signal | Token | Status |
|---|------|--------------|--------|-------|--------|
| 1 | 🎓 **DEMO — not scored** | `failedReadinessProbe` | Log (cart) | `EFTSURE_FLAG{cart_readiness_9t3kx}` | ✅ used in the live walkthrough; **not** part of scoring |
| 2 | 🟢 Easy | `productCatalogFailure` | Log + Trace (product-catalog) | `EFTSURE_FLAG{catalog_fault_r7m2w}` | ✅ verified (log + trace) |
| 5 | 🟡 Medium | `emailMemoryLeak` | Metric (collector threshold) | `EFTSURE_FLAG{email_heap_creep_h2c7j}` | ✅ verified (token on both email mem metrics) |
| 3 | 🟢 Easy | `adManualGc` | Log (ad) | `EFTSURE_FLAG{ad_gc_pause_b8x4q}` | ✅ implemented + builds |
| 6 | 🟡 Medium | `paymentUnreachable` | Trace (checkout) | `EFTSURE_FLAG{payment_offline_t4w9r}` | ✅ verified (token on errored `charge` span) |
| 4 | 🟡 Medium | `adHighCpu` | Metric (collector threshold) | `EFTSURE_FLAG{ad_cpu_thermal_v5n6d}` | ✅ verified (JVM saturates under 2-core cap) |
| 7 | 🟡 Medium | `recommendationCacheFailure` | Trace (recommendation) | `EFTSURE_FLAG{reco_cache_bloat_k3z8m}` | ✅ verified (token on cache-miss spans) |
| 8 | 🔴 Hard | `paymentFailure` | Trace, intermittent (payment) | `EFTSURE_FLAG{charge_declined_q6f2n}` | ✅ verified (token on errored payment charge spans) |

---

## #1 — `failedReadinessProbe` 🎓 Log — DEMO FLAG (not scored)

- **🎓 This is the live-demo flag, used in the facilitator walkthrough — it is NOT scored.** That
  leaves **#2–#8 (7 flags)** as the scored challenges.
- **Token:** `EFTSURE_FLAG{cart_readiness_9t3kx}`
- **Status:** ✅ implemented, cart image builds.
- **Service / files:** cart (C#) — `src/cart/src/services/HealthCheckService.cs` (token in the
  `HealthCheckResult.Unhealthy(...)` description) and `src/cart/src/Program.cs`
  (`IncludeFormattedMessage = true` so the existing framework health-check log renders into the body).
- **Failure:** cart readiness probe reports `Unhealthy` — the service looks unready/flapping.
- **Where the token lives:** the **existing** ASP.NET health-check failure log
  (`Microsoft.Extensions.Diagnostics.HealthChecks`), `HealthStatus=Unhealthy`, in the
  `HealthCheckDescription` field and the rendered body. This is the real readiness-failure signal,
  not a synthetic line.
- **Flag note:** now defaults to `off` in `demo.flagd.json` (was `on`) — token only appears once the
  facilitator switches the flag on.
- **Find it (Loki):**
  ```
  {service_name="cart"} |= "EFTSURE_FLAG"
  ```
  or filter to the health-check error: `{service_name="cart"} | HealthStatus = "Unhealthy"`.
- **Hint ladder:**
  1. "A core service is reporting itself unhealthy — which one, and how would you know?"
  2. "Check that service's **logs** in Loki."
  3. "Look at the health-check failure log's description / search the service logs for `EFTSURE_FLAG`."

---

## #2 — `productCatalogFailure` 🟢 Log + Trace

- **Token:** `EFTSURE_FLAG{catalog_fault_r7m2w}`
- **Status:** ✅ verified on remote — token in both the error log and the errored span.
- **Where:** `src/product-catalog/main.go` `GetProduct` failure branch — reworded the giveaway message
  to a realistic datastore error, set `incident_ref` span attribute (+ `status=error` +
  event), and added an `slog.LevelError` log whose **message** contains the token.
- **Flag note:** targeting rule removed in `demo.flagd.json` — now a plain on/off flag (defaults
  `off`). Toggling it **on** fails **all** product lookups (storefront-wide outage; cascades into
  cart/checkout while on) — turn on only for this challenge.
- **Find it:** Loki `{service_name="product-catalog"} |= "EFTSURE_FLAG"` (the error log message),
  and/or Tempo `{ resource.service.name = "product-catalog" && status = error }` /
  `{ span.incident_ref != "" }`.
- **Why Easy:** with both error logs *and* errored traces lighting up, it's very obvious — a good
  early confidence-builder that teaches both Loki and Tempo.
- **Hint ladder:** 1) "Products are failing to load." 2) "Check product-catalog **error logs** or
  **error traces**." 3) "Read the error log message / the errored span's `incident_ref`."

---

## #3 — `adManualGc` 🟢 Log

- **Token:** `EFTSURE_FLAG{ad_gc_pause_b8x4q}`
- **Status:** ✅ implemented, ad image builds.
- **Service / files:** ad (Java) — `src/ad/src/main/java/oteldemo/AdService.java` ~243 (token in the
  WARN) and `src/ad/src/main/java/oteldemo/problempattern/GarbageCollectionTrigger.java` (lines 45, 58).
- **Failure:** ad service forces repeated full GCs → heap pressure / latency spikes.
- **Disguise:** the three logs were reworded to drop the giveaways ("Feature Flag adManualGc enabled",
  "manual garbage collection", "artificially triggered") so they read like a genuine heap-pressure
  incident:
  - `AdService`: "High heap pressure detected in ad service; forcing a full GC to reclaim memory,
    response latency may spike. ref=EFTSURE_FLAG{ad_gc_pause_b8x4q}"
  - `GarbageCollectionTrigger`: "Heap usage critical; initiating full GC cycle, next sweep in 10s."
  - `GarbageCollectionTrigger` (now WARN): "Full GC pauses stalled the ad service for N ms"
- **Where the token lives:** the lead `AdService` WARN log body.
- **Find it (Loki):** `{service_name="ad"} |= "EFTSURE_FLAG"` (or browse ad WARN logs for the heap-pressure messages).
- **Hint ladder:**
  1. "A service is suffering heap pressure / GC pauses — which one?"
  2. "Check the **ad** service WARN logs."
  3. "Search ad logs for `EFTSURE_FLAG`."

---

## #4 — `adHighCpu` 🟡 Metric (collector threshold)

- **Token:** `EFTSURE_FLAG{ad_cpu_thermal_v5n6d}`
- **Status:** ✅ verified on remote — with the 2-core cap, `jvm_cpu_recent_utilization_ratio` saturates and the token stamps.
- **Make-it-look-real:** ad is **CPU-capped to 2 cores** in `compose.extras.yaml`
  (`cpus: "2"`). docker reports `container_cpu_utilization_ratio` against the *host's* ~70 cores, so
  the busy threads barely register there — but the JVM is cgroup-aware, so the 4 CPULoad threads
  over-subscribe the 2-core cap 2:1, making `jvm_cpu_recent_utilization_ratio` **saturate to ~1.0**
  with heavy throttling (a real CPU-exhaustion incident: ad starves, latency/errors climb).
- **Where:** `transform/ctf_metric_flags` in `src/otel-collector/otelcol-config-extras.yml`:
  - **Primary —** `jvm.cpu.recent_utilization` (→ `jvm_cpu_recent_utilization_ratio`),
    `service.name="ad"`, `value_double > 0.7` (capped baseline ≤~0.5 on bursts, saturates to ~1.0).
  - **Best-effort second —** `container.cpu.utilization` (→ `container_cpu_utilization_ratio`),
    `value_double > 0.18`. Host-relative, so it rarely fires; confirm under load and likely swap for
    `process_cpu_utilization_ratio` if that proves cgroup-aware.
- **Find it (PromQL):** `jvm_cpu_recent_utilization_ratio{service_name="ad"}` → inspect labels for
  `runtime_seed`. (Also visible as a CPU spike in the ad service's JVM Runtime view.)
- **Hint ladder:** 1) "A service is burning CPU / getting throttled." 2) "Find the **CPU metric**
  for that service (JVM/runtime CPU)." 3) "Inspect the series **labels** while it's pegged."

---

## #5 — `emailMemoryLeak` 🟡 Metric (collector threshold)

- **Token:** `EFTSURE_FLAG{email_heap_creep_h2c7j}`
- **Status:** ✅ verified on remote — token stamped on both `container_memory_percent_ratio` and `container_memory_usage_total_bytes` for email once past threshold.
- **Where:** `transform/ctf_metric_flags` in `src/otel-collector/otelcol-config-extras.yml`. Two
  metrics (redundancy), in-pipeline OTel names, thresholds on the **corrected 0-1 scale**:
  - `container.memory.percent` (→ `container_memory_percent_ratio`), `service.name="email"`,
    `value_double > 0.4` (baseline ~0.11 ratio, leak → ~0.5+).
  - `container.memory.usage.total` (→ `container_memory_usage_total_bytes`), `service.name="email"`,
    `value_int > 150000000` (baseline ~57 MB, leak → ~256 MB).
- **Note:** at a high leak multiplier email nears its 512 MB limit and OOM-restarts (token briefly
  gone after each restart, then reappears). Use a lower multiplier to keep it dwelling in the leaked state.
- **Find it (PromQL):** `container_memory_percent_ratio{service_name="email"}` or
  `container_memory_usage_total_bytes{service_name="email"}` → inspect labels for `incident_ref`.
  Appears only above threshold (once the leak is severe).
- **Hint ladder:** 1) "A service's memory is climbing." 2) "Find the **memory metric** for that
  service." 3) "Inspect the series **labels** once it's well above normal."

---

## #6 — `paymentUnreachable` 🟡 Trace

- **Token:** `EFTSURE_FLAG{payment_offline_t4w9r}`
- **Status:** ✅ verified on remote — token on the dedicated errored `charge` span.
- **Where:** `src/checkout/main.go` `chargeCard()` — wraps the charge in its own `charge` span; when
  the flag points payment at `badAddress:50051`, sets `incident_ref` on that span and
  records the error/`status=error` when the Charge RPC fails. So the failing payment step is a
  clearly-named, red span carrying the token.
- **Find it (Tempo/TraceQL):** `{ name = "charge" && status = error }` or
  `{ span.incident_ref != "" }` → read the `charge` span's attributes.
- **Note:** don't be misled by email `EOF` errors in checkout traces — those are unrelated email
  flakiness; the payment-unreachable failure is the `charge` span.
- **Hint ladder:** 1) "Checkouts are failing." 2) "**Trace** a failed checkout, find the payment
  step." 3) "Read the attributes on the errored `charge` span (`incident_ref`)."

---

## #7 — `recommendationCacheFailure` 🟡 Trace

- **Token:** `EFTSURE_FLAG{reco_cache_bloat_k3z8m}`
- **Status:** ✅ verified on remote — token on cache-miss `get_product_list` spans.
- **Where:** `src/recommendation/recommendation_server.py` — in `get_product_list`, on the
  **cache-miss branch** (the path that bloats `cached_ids`), set `cache.shard_ref` on the
  `get_product_list` span alongside `demo.recommendation.cache_hit=false`.
- **Intermittent:** the miss branch fires ~50% of the time (and always on first run) while the flag
  is on, so plenty of spans carry it under steady traffic — but not every single one.
- **Find it (Tempo/TraceQL):** `{ span.cache.shard_ref != "" }`, or browse recommendation
  `get_product_list` spans with `demo.recommendation.cache_hit = false` (+ a ballooning
  `demo.product.count`).
- **Hint ladder:** 1) "Recommendations are slow / memory is creeping up." 2) "**Trace** a
  recommendation request (`get_product_list`)." 3) "Find the cache-miss span and read its attributes."

---

## #8 — `paymentFailure` 🔴 Trace (intermittent)

- **Token:** `EFTSURE_FLAG{charge_declined_q6f2n}`
- **Status:** ✅ verified on remote — token on errored payment `charge` spans (`status=error`).
- **Where:** `src/payment/charge.js` — on the failing branch (`Math.random() < paymentFailure`), set
  `txn.settlement_id` on the payment `charge` span before it throws; the existing catch records the
  exception and `status=error`.
- **Intermittent:** only the failing fraction carry the token — set the flag to a percentage (e.g.
  `25%`/`50%`); the bigger the %, the more failing spans, the easier the hunt.
- **Find it (Tempo/TraceQL):** `{ resource.service.name = "payment" && status = error }` →
  read the errored charge span's attributes, or `{ resource.service.name = "payment" && span.txn.settlement_id != "" }`.
- **Note:** the **payment** service and the **checkout** service both have a span named `charge`
  (checkout's is challenge #6, paymentUnreachable). Scope by `resource.service.name = "payment"` to
  isolate this one.
- **Hint ladder:** 1) "Some payments fail, some succeed." 2) "Filter payment traces to **errors
  only**." 3) "Read `txn.settlement_id` across several failing charge spans (don't trust the first trace)."
