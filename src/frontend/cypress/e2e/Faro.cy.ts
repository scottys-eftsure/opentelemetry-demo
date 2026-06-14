// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import SessionGateway from '../../gateways/Session.gateway';

describe('Faro Frontend Observability', () => {
  it('should inject NEXT_PUBLIC_FARO_URL into window.ENV when FARO_COLLECTOR_URL is configured', () => {
    cy.visit('/');
    cy.window().its('ENV.NEXT_PUBLIC_FARO_URL').should('be.a', 'string').and('not.be.empty');
  });

  it('should initialise the Faro SDK when NEXT_PUBLIC_FARO_URL is present', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.ENV = {
          ...win.ENV,
          NEXT_PUBLIC_FARO_URL: 'https://faro-collector-stub.grafana.net/collect/stub-key',
        };
      },
    });
    cy.window().its('faro.api').should('be.ok');
  });

  it('should load without errors when NEXT_PUBLIC_FARO_URL is absent', () => {
    // Strip the Faro URL from the server-rendered inline ENV script so that
    // initFaro() sees an empty URL and returns early. onBeforeLoad alone is
    // insufficient because the server-side inline script runs after it.
    cy.intercept('GET', '/', (req) => {
      req.on('response', (res) => {
        if (typeof res.body === 'string') {
          res.body = res.body.replace(/NEXT_PUBLIC_FARO_URL: '[^']*'/g, "NEXT_PUBLIC_FARO_URL: ''");
        }
      });
    }).as('homeWithNoFaro');
    cy.visit('/');
    cy.get('body').should('exist');
    cy.window().then(win => {
      // faro.config is only present on the fully-initialized Faro instance;
      // before initializeFaro the SDK stub has no .config property
      expect((win as any).faro?.config).to.be.undefined;
    });
  });

  it('should bridge Faro user identity with SessionGateway userId', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.ENV = {
          ...win.ENV,
          NEXT_PUBLIC_FARO_URL: 'https://faro-collector-stub.grafana.net/collect/stub-key',
        };
      },
    });
    cy.window().then(win => {
      const userId = SessionGateway.getSession().userId;
      expect((win as any).faro?.metas?.value?.user?.id).to.equal(userId);
    });
  });
});
