# PRD: Add Grafana Faro Frontend Observability to the frontend service

## Problem Statement

Developers and operators running the OpenTelemetry demo have full visibility into backend service traces and metrics via Jaeger and Prometheus, but have no visibility into what is happening in the browser. There is no data on Core Web Vitals, JavaScript exceptions, user sessions, console errors, or page navigation — all of which are critical signals for understanding real user experience. The existing OTel browser tracer only captures fetch/XHR spans; it does not surface the full picture of frontend health.

## Solution

Integrate the Grafana Faro Web SDK into the frontend service so that browser-side telemetry — web vitals, JS exceptions, console logs, page views, and user sessions — is automatically captured and forwarded to Grafana Cloud Frontend Observability. Faro is wired into the existing `WebTracerProvider` so that trace context is shared between OTel spans (already flowing to Jaeger) and all Faro-captured events, enabling correlation across both systems. The integration is opt-in: when no Faro collector URL is configured the application continues to work identically, with no errors.

## User Stories

1. As a developer running the demo locally, I want web vitals (LCP, CLS, FCP, TTFB) to be automatically captured and visible in Grafana Cloud, so that I can see real browser performance data without any manual instrumentation.
2. As a developer running the demo locally, I want JavaScript exceptions to be captured with stack traces in Grafana Cloud, so that I can identify and diagnose frontend errors quickly.
3. As a developer, I want console errors and warnings captured as Faro log events, so that I can correlate application log output with session activity in Grafana Cloud.
4. As a developer, I want user sessions tracked in Grafana Cloud Frontend Observability, so that I can replay the sequence of events a user experienced before an error occurred.
5. As a developer, I want page view and navigation events captured automatically, so that I can understand how users are navigating through the Astronomy Shop.
6. As a developer, I want Faro session identity to be the same as the existing OTel `session.id` and `enduser.id` span attributes, so that I can pivot between a Grafana Cloud session view and a Jaeger trace view for the same user.
7. As a developer, I want Faro trace events to carry the current OTel trace context, so that errors and web vital measurements can be correlated with the backend spans that were active at the time.
8. As a developer, I want Faro to initialize before the OTel `WebTracerProvider` is registered, so that the Faro session processor can attach session metadata to all spans from the first request.
9. As a demo operator, I want Faro to be fully opt-in via environment variables, so that the demo works out of the box without any Grafana Cloud account or credentials.
10. As a demo operator, I want the Faro collector URL and app name to be configurable at container runtime (not baked into the image at build time), so that the same image can be used across environments with different Grafana Cloud endpoints.
11. As a demo operator, I want the Faro credentials to live in `.env.override` and never in `.env`, so that no secrets are accidentally committed to the repository.
12. As a demo operator, I want clear instructions in `.env` (as comments) explaining how to configure Faro, so that newcomers can set it up without reading documentation elsewhere.
13. As a developer, I want synthetic load-generator requests to also flow through Faro, so that I can observe how the full traffic profile — including generated load — appears in Grafana Cloud session data.
14. As a developer, I want the existing OTel OTLP export to the local collector (and onward to Jaeger) to remain completely unchanged, so that adding Faro does not break any existing observability workflow.
15. As a developer, I want `FaroTraceExporter` and `FaroSessionSpanProcessor` added to the existing `WebTracerProvider` rather than creating a second provider, so that there is a single authoritative OTel context and no double-initialisation conflicts.
16. As a developer, I want `faro.api.initOTEL` called after the provider is registered, so that all Faro-captured events carry accurate trace and span IDs.
17. As a developer, I want Faro initialisation to be idempotent, so that React strict mode's double-invoke in development does not cause errors or duplicate sessions.
18. As a developer, I want Faro initialisation to be a no-op when running server-side (SSR), so that the SDK does not attempt to access browser APIs during Next.js server rendering.
19. As a demo operator, I want a `CORS Allowed Origin` of `http://localhost:8080` to be the documented value for local development, so that browser requests to Grafana Cloud are not blocked by CORS policy.

## Implementation Decisions

- **Direct-to-cloud transport.** The Faro SDK sends browser telemetry directly to the Grafana Cloud Faro collector endpoint from the browser. No Alloy proxy or local Loki instance is added to the compose stack. CORS is handled by configuring the Grafana Cloud Frontend Observability application to allow `http://localhost:8080`.

- **Faro alongside existing OTel, not replacing it.** The existing `WebTracerProvider` (OTLPTraceExporter → Envoy → OTel Collector → Jaeger) is preserved exactly as-is. Faro is integrated by adding `FaroSessionSpanProcessor` and `FaroTraceExporter` as additional span processors on the same provider after it is constructed, and calling `faro.api.initOTEL(trace, context)` to register OTel with the Faro instance. `TracingInstrumentation` from `@grafana/faro-web-tracing` is **not** used — that would create a second provider.

- **New `FaroSetup` module (browser-only).** A dedicated module initialises the Faro SDK. It reads configuration from `window.ENV` (the existing runtime injection mechanism used for the OTLP endpoint), guards against SSR, guards against re-initialisation, and no-ops silently when `NEXT_PUBLIC_FARO_URL` is absent. It sets the Faro user ID to the `userId` from `SessionGateway` so that Faro sessions are correlated with OTel `session.id` / `enduser.id` attributes. Instrumentations: `getWebInstrumentations({ captureConsole: true })` only (no `TracingInstrumentation`).

- **Initialisation order in the app bootstrap.** `initFaro()` is called before `FrontendTracer()` in the browser-side initialisation block. This ordering ensures the Faro instance exists when `FrontendTracer` attempts to add the Faro span processors.

- **`FrontendTracer` integration.** After `provider.register()`, a conditional block checks `faro.api` (the global Faro instance) and, if present, calls `provider.addSpanProcessor(new FaroSessionSpanProcessor(new BatchSpanProcessor(new FaroTraceExporter({ ...faro })), faro.metas))` followed by `faro.api.initOTEL(trace, context)`.

- **Runtime environment injection via `window.ENV`.** Two new fields — `NEXT_PUBLIC_FARO_URL` and `NEXT_PUBLIC_FARO_APP_NAME` — are added to the `window.ENV` object injected by the server-side document `getInitialProps` method, following the identical pattern used for `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` today. No build-time baking via the Next.js config is needed.

- **Container environment variables.** `FARO_COLLECTOR_URL` and `FARO_APP_NAME` are added to the frontend service `environment` block in the compose file as pass-throughs. They default to empty, making Faro opt-in. Values are documented as comments in `.env`, intended to be set in `.env.override`.

- **`window.ENV` TypeScript interface extended.** The `Window` interface declaration gains `NEXT_PUBLIC_FARO_URL` and `NEXT_PUBLIC_FARO_APP_NAME` optional string fields.

- **New packages.** `@grafana/faro-web-sdk` and `@grafana/faro-web-tracing` are added to `dependencies` in `package.json`.

- **No synthetic request filter.** Faro initialises unconditionally when a URL is configured. Synthetic load-generator traffic is intentionally included in Faro session data. This is a deliberate departure from the existing OTel OTLP endpoint behaviour (which redirects synthetic requests to the internal collector).

## Testing Decisions

**What makes a good test:** Tests should assert on external, observable browser behaviour — the presence of initialised globals, injected `window.ENV` values, and correct user identity — not on internal SDK state, span processor counts, or Faro SDK version details.

**Test layer:** All tests use the existing Cypress E2E seam (`cypress/e2e/*.cy.ts`). This is the only test layer in the frontend service and is the highest available seam. No new test infrastructure is introduced.

**Prior art:** `Home.cy.ts` demonstrates the existing pattern — `cy.visit()` with optional `onBeforeLoad` callbacks to pre-configure `localStorage` or `window` state, followed by assertions on DOM and `window` globals (e.g. `SessionGateway.getSession().userId`).

**Tests to add** (new file `cypress/e2e/Faro.cy.ts`):

1. **`window.ENV` injection** — Visit `/` and assert `window.ENV.NEXT_PUBLIC_FARO_URL` is a non-empty string when the env var is configured. Tests the server-side injection chain end-to-end.

2. **Faro SDK initialised** — Using `onBeforeLoad` to set `win.ENV.NEXT_PUBLIC_FARO_URL` to a stub value, visit `/` and assert `window.faro.api` is truthy. Tests the full init path from env to SDK ready.

3. **Graceful degradation** — Using `onBeforeLoad` to clear `win.ENV.NEXT_PUBLIC_FARO_URL`, visit `/` and assert no uncaught exceptions occur and the page renders normally (`window.faro.api` is falsy or absent). Tests that the demo functions without credentials.

4. **User identity bridging** — After page load, assert the Faro user ID matches the `userId` held in the `SessionGateway` localStorage session. Tests that Faro sessions and OTel session attributes are correlated on the same identity.

## Out of Scope

- **Grafana Alloy as a local Faro receiver.** Considered and explicitly decided against for simplicity. Alloy + Loki would add two new services to the compose stack with no benefit for users targeting Grafana Cloud.
- **Local Loki for Faro log storage.** Not needed; Grafana Cloud Loki receives log data directly.
- **Backend correlation middleware (`server-timing` header).** Next.js Pages Router middleware for injecting `traceparent` into response headers is not part of this change.
- **Source map uploads.** Uploading built static asset source maps to Grafana Cloud via the Faro CLI is not part of this change.
- **Grafana dashboard provisioning.** No new local Grafana dashboards for Faro data are added; the Grafana Cloud Frontend Observability UI is the intended view.
- **Replacing the existing OTel browser tracing pipeline.** The `WebTracerProvider` → OTLP → Jaeger path is unchanged.
- **Faro for server-side Next.js instrumentation.** The existing Node.js SDK setup is unchanged.

## Further Notes

- The Grafana Cloud Frontend Observability application must be created manually before the integration is active. Required setup: create an app in Grafana Cloud > Frontend > Frontend Apps, set CORS Allowed Origin to `http://localhost:8080`, copy the collector URL, and add it to `.env.override` as `FARO_COLLECTOR_URL`.
- The Faro collector URL embeds the app key (e.g. `https://faro-collector-xxx.grafana.net/collect/{app-key}`). This is a low-sensitivity collector key, not an account credential, but it should still be kept out of the committed `.env` file.
- `@grafana/faro-web-tracing` packages its own OTel dependencies. Version compatibility with the existing `@opentelemetry/api` and `@opentelemetry/sdk-trace-web` versions should be verified during the npm install step; pin to a version that satisfies peer dependency constraints if needed.
