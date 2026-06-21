# 🚩 CTF Answer Key — TESTING_FLAG tokens

> **⚠️ FACILITATOR ANSWER KEY.** The repo is private to participants, so committing is fine.
> If it ever becomes accessible, every challenge is spoiled.
>
> **🧪 TESTING PREFIX IN USE:** all tokens currently use the placeholder prefix `TESTING_FLAG`
> while iterating, so the real `EFTSURE_FLAG` prefix never lands in test history. **Final step
> before the event: swap `TESTING_FLAG` → `EFTSURE_FLAG` everywhere** (code + this file).

Telemetry backend: **Grafana Cloud** stack `hackathon.grafana.net` (gcx context `hackathon`,
namespace `ctf`). Demo runs via `make start-minimal-no-o11y`. Tokens are **static, one per
challenge, identical for all players**, submitted privately to the facilitator.

Difficulty comes from *which signal you check* and *intermittency*, not obfuscation. Only the
log challenges (#1, #2, #7) are findable by a Loki free-text search; metric/trace tokens are
invisible to log search by design.

> **Collector side-fix:** `transform/fix_container_pct_scale` divides `container.memory.percent`
> and `container.cpu.utilization` by 100 so they're true 0-1 ratios. This corrects a `docker_stats`
> mis-scaling (values were 0-100 under a `_ratio` name → App O11y showed e.g. 4500% instead of 45%).
> All metric thresholds below are on this corrected 0-1 scale.

| # | Tier | Feature flag | Signal | Token | Status |
|---|------|--------------|--------|-------|--------|
| 1 | 🟢 Easy | `failedReadinessProbe` | Log (cart) | `TESTING_FLAG{cart_readiness_dn41x}` | ✅ implemented + builds |
| 2 | 🟢 Easy | `adManualGc` | Log (ad) | `TESTING_FLAG{ad_gc_pause_7k2pm}` | ✅ implemented + builds |
| 3 | 🟡 Medium | `adHighCpu` | Metric (collector threshold) | `TESTING_FLAG{ad_cpu_thermal_q9w3e}` | 🛠️ implemented — CPU thresholds need calibration |
| 4 | 🟡 Medium | `emailMemoryLeak` | Metric (collector threshold) | `TESTING_FLAG{email_heap_creep_v5t8r}` | ✅ implemented |
| 5 | 🟡 Medium | `paymentUnreachable` | Trace (checkout) | `TESTING_FLAG{payment_offline_z3x7c}` | ⏳ planned |
| 6 | 🟡 Medium | `recommendationCacheFailure` | Trace (recommendation) | `TESTING_FLAG{reco_cache_bloat_m6n2b}` | ⏳ planned |
| 7 | 🔴 Hard | `productCatalogFailure` | Log + Trace (product-catalog) | `TESTING_FLAG{catalog_fault_p4l9k}` | ⏳ planned |
| 8 | 🔴 Hard | `paymentFailure` | Trace, intermittent (payment) | `TESTING_FLAG{charge_declined_h8j5g}` | ⏳ planned |

---

## #1 — `failedReadinessProbe` 🟢 Log

- **Token:** `TESTING_FLAG{cart_readiness_dn41x}`
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
  {service_name="cart"} |= "TESTING_FLAG"
  ```
  or filter to the health-check error: `{service_name="cart"} | HealthStatus = "Unhealthy"`.
- **Hint ladder:**
  1. "A core service is reporting itself unhealthy — which one, and how would you know?"
  2. "Check that service's **logs** in Loki."
  3. "Look at the health-check failure log's description / search the service logs for `TESTING_FLAG`."

---

## #2 — `adManualGc` 🟢 Log

- **Token:** `TESTING_FLAG{ad_gc_pause_7k2pm}`
- **Status:** ✅ implemented, ad image builds.
- **Service / files:** ad (Java) — `src/ad/src/main/java/oteldemo/AdService.java` ~243 (token in the
  WARN) and `src/ad/src/main/java/oteldemo/problempattern/GarbageCollectionTrigger.java` (lines 45, 58).
- **Failure:** ad service forces repeated full GCs → heap pressure / latency spikes.
- **Disguise:** the three logs were reworded to drop the giveaways ("Feature Flag adManualGc enabled",
  "manual garbage collection", "artificially triggered") so they read like a genuine heap-pressure
  incident:
  - `AdService`: "High heap pressure detected in ad service; forcing a full GC to reclaim memory,
    response latency may spike. ref=TESTING_FLAG{ad_gc_pause_7k2pm}"
  - `GarbageCollectionTrigger`: "Heap usage critical; initiating full GC cycle, next sweep in 10s."
  - `GarbageCollectionTrigger` (now WARN): "Full GC pauses stalled the ad service for N ms"
- **Where the token lives:** the lead `AdService` WARN log body.
- **Find it (Loki):** `{service_name="ad"} |= "TESTING_FLAG"` (or browse ad WARN logs for the heap-pressure messages).
- **Hint ladder:**
  1. "A service is suffering heap pressure / GC pauses — which one?"
  2. "Check the **ad** service WARN logs."
  3. "Search ad logs for `TESTING_FLAG`."

---

## #3 — `adHighCpu` 🟡 Metric (collector threshold)

- **Token:** `TESTING_FLAG{ad_cpu_thermal_q9w3e}`
- **Status:** 🛠️ implemented (collector rule); **CPU thresholds need calibration** vs the live spike.
- **Where:** `transform/ctf_metric_flags` in `src/otel-collector/otelcol-config-extras.yml`. Two
  metrics (redundancy), in-pipeline OTel names, thresholds on the **corrected 0-1 scale** (see the
  `transform/fix_container_pct_scale` ÷100 fix below):
  - `container.cpu.utilization` (→ `container_cpu_utilization_ratio`), `service.name="ad"`,
    `value_double > 0.18` (baseline ~0.105; `adHighCpu` runs 4 CPU-bound threads). **CALIBRATE.**
  - `jvm.cpu.recent_utilization` (→ `jvm_cpu_recent_utilization_ratio`, already 0-1, NOT rescaled),
    `service.name="ad"`, `value_double > 0.15` (baseline ~0.064). **CALIBRATE.**
- **Find it (PromQL):** `container_cpu_utilization_ratio{service_name="ad"}` or
  `jvm_cpu_recent_utilization_ratio{service_name="ad"}` → inspect labels for `incident_token`.
  Appears only while CPU is above threshold.
- **Hint ladder:** 1) "A service is burning CPU." 2) "Find the **CPU metric** for that service."
  3) "Inspect the series **labels** while it's spiking."

---

## #4 — `emailMemoryLeak` 🟡 Metric (collector threshold)

- **Token:** `TESTING_FLAG{email_heap_creep_v5t8r}`
- **Status:** ✅ implemented (collector rule).
- **Where:** `transform/ctf_metric_flags` in `src/otel-collector/otelcol-config-extras.yml`. Two
  metrics (redundancy), in-pipeline OTel names, thresholds on the **corrected 0-1 scale**:
  - `container.memory.percent` (→ `container_memory_percent_ratio`), `service.name="email"`,
    `value_double > 0.4` (baseline ~0.11 ratio, leak → ~0.5+).
  - `container.memory.usage.total` (→ `container_memory_usage_total_bytes`), `service.name="email"`,
    `value_int > 150000000` (baseline ~57 MB, leak → ~256 MB).
- **Find it (PromQL):** `container_memory_percent_ratio{service_name="email"}` or
  `container_memory_usage_total_bytes{service_name="email"}` → inspect labels for `incident_token`.
  Appears only above threshold (once the leak is severe).
- **Hint ladder:** 1) "A service's memory is climbing." 2) "Find the **memory metric** for that
  service." 3) "Inspect the series **labels** once it's well above normal."

---

## #5 — `paymentUnreachable` 🟡 Trace  *(planned)*

- **Token:** `TESTING_FLAG{payment_offline_z3x7c}`
- **Where:** `src/checkout/main.go` ~558 — span attribute on the PlaceOrder span when the flag points
  payment at the bad address.
- **Find it (Tempo/TraceQL):** errored checkout spans, e.g.
  `{ resource.service.name = "checkout" && status = error }` → read span attributes.
- **Hint ladder:** 1) "Checkouts are failing." 2) "**Trace** a failed checkout." 3) "Read the
  attributes on the failing payment span."

---

## #6 — `recommendationCacheFailure` 🟡 Trace  *(planned)*

- **Token:** `TESTING_FLAG{reco_cache_bloat_m6n2b}`
- **Where:** `src/recommendation/recommendation_server.py` ~79-94 — span attribute on the cache-miss
  branch (`demo.recommendation.cache_hit=false`).
- **Find it (Tempo/TraceQL):** recommendation spans with `demo.recommendation.cache_hit = false` →
  read attributes.
- **Hint ladder:** 1) "Recommendations are slow / memory is growing." 2) "**Trace** a recommendation
  request." 3) "Find the span where the cache misses and read its attributes."

---

## #7 — `productCatalogFailure` 🔴 Log + Trace  *(planned)*

- **Token:** `TESTING_FLAG{catalog_fault_p4l9k}`
- **Where:** `src/product-catalog/main.go` ~369-372 — **add** an `slog.LevelError` log on the failure
  branch (token in the log) alongside the existing error span event (token optionally on the event).
- **Flag note:** targeting rule currently resolves `off`/`off` — set `defaultVariant:"on"` or fix the
  targeting in `demo.flagd.json` to use it.
- **Find it:** Loki `{service_name="product-catalog"} |= "TESTING_FLAG"` and/or Tempo
  `{ resource.service.name = "product-catalog" && status = error }`.
- **Hint ladder:** 1) "A specific product errors out." 2) "Check product-catalog **error logs** or
  **error traces**." 3) "Read the error message / span event."

---

## #8 — `paymentFailure` 🔴 Trace (intermittent)  *(planned)*

- **Token:** `TESTING_FLAG{charge_declined_h8j5g}`
- **Where:** `src/payment/charge.js` ~30-39 — span attribute set on the failing charge span (the
  ~n% that throw).
- **Find it (Tempo/TraceQL):** `{ resource.service.name = "payment" && status = error }` → read span
  attributes. Hard because only the failing fraction carry it — don't trust the first trace.
- **Hint ladder:** 1) "Some payments fail, some succeed." 2) "Filter payment traces to **errors
  only**." 3) "Read attributes across several failing spans."
