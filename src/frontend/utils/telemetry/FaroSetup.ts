// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { getWebInstrumentations, initializeFaro, isInternalFaroOnGlobalObject } from '@grafana/faro-web-sdk';
import SessionGateway from '../../gateways/Session.gateway';

export function initFaro(): void {
  // SSR guard
  if (typeof window === 'undefined') return;

  // Idempotency guard — isInternalFaroOnGlobalObject() is the v2-correct check;
  // faro.api is pre-populated in v2 before initializeFaro is called, so it cannot
  // be used as an initialisation sentinel.
  if (isInternalFaroOnGlobalObject()) return;

  const url = window.ENV?.NEXT_PUBLIC_FARO_URL;

  // URL guard — opt-in only
  if (!url) return;

  try {
    const faroInstance = initializeFaro({
      url,
      app: {
        name: window.ENV?.NEXT_PUBLIC_FARO_APP_NAME || 'opentelemetry-demo',
        environment: process.env.NODE_ENV,
      },
      instrumentations: getWebInstrumentations({ captureConsole: true }),
      ignoreErrors: [
        /^ResizeObserver loop limit exceeded$/,
        /^ResizeObserver loop completed with undelivered notifications$/,
        /^Script error\.$/,
        /chrome-extension:\/\//,
        /moz-extension:\/\//,
      ],
    });

    faroInstance.api.setUser({ id: SessionGateway.getSession().userId });
  } catch {
    // Faro must never crash the app — swallow any SDK-internal errors
  }
}
