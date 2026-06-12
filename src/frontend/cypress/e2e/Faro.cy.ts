// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

describe('Faro Frontend Observability', () => {
  it('should inject NEXT_PUBLIC_FARO_URL into window.ENV when FARO_COLLECTOR_URL is configured', () => {
    cy.visit('/');
    cy.window().its('ENV.NEXT_PUBLIC_FARO_URL').should('be.a', 'string').and('not.be.empty');
  });
});
