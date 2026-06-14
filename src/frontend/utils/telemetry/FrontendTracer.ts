// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { trace, context } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { resourceFromAttributes, detectResources } from '@opentelemetry/resources';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { faro, isInternalFaroOnGlobalObject } from '@grafana/faro-web-sdk';
import { FaroMetaAttributesSpanProcessor, FaroTraceExporter } from '@grafana/faro-web-tracing';
import { SessionIdProcessor } from './SessionIdProcessor';

const {
  NEXT_PUBLIC_OTEL_SERVICE_NAME = '',
  NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = '',
  IS_SYNTHETIC_REQUEST = '',
} = typeof window !== 'undefined' ? window.ENV : {};

const FrontendTracer = async () => {
  const { ZoneContextManager } = await import('@opentelemetry/context-zone');

  let resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: NEXT_PUBLIC_OTEL_SERVICE_NAME,
  });
  const detectedResources = detectResources({detectors: [browserDetector]});
  resource = resource.merge(detectedResources);

  const spanProcessors = [
    new SessionIdProcessor(),
    new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
        }),
        {
          scheduledDelayMillis: 500,
        }
    ),
  ];

  // Wire Faro into the existing provider when it has been initialised (opt-in).
  // isInternalFaroOnGlobalObject() is the v2-correct sentinel — faro.api is
  // pre-populated with stubs before initializeFaro and cannot be used alone.
  if (isInternalFaroOnGlobalObject()) {
    spanProcessors.push(
      new FaroMetaAttributesSpanProcessor(
        new BatchSpanProcessor(new FaroTraceExporter({ ...faro })),
        faro.metas,
      )
    );
  }

  const provider = new WebTracerProvider({
    resource,
    spanProcessors,
  });

  const contextManager = new ZoneContextManager();

  provider.register({
    contextManager,
    propagator: new CompositePropagator({
      propagators: [
        new W3CBaggagePropagator(),
        new W3CTraceContextPropagator()],
    }),
  });

  // Register the existing OTel context with Faro so all Faro-captured events
  // (web vitals, exceptions, console logs) carry the active trace and span IDs.
  // Must be called after provider.register() so the context APIs are wired up.
  if (isInternalFaroOnGlobalObject()) {
    faro.api.initOTEL(trace, context);
  }

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-fetch': {
          propagateTraceHeaderCorsUrls: /.*/,
          clearTimingResources: true,
          applyCustomAttributesOnSpan(span) {
            span.setAttribute('demo.synthetic_request', IS_SYNTHETIC_REQUEST);
          },
        },
      }),
    ],
  });
};

export default FrontendTracer;
