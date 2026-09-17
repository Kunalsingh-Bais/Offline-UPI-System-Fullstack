import { TestBed } from '@angular/core/testing';

import { WifiPaymentBuilder } from './wifi-payment-builder';

describe('WifiPaymentBuilder', () => {
  let service: WifiPaymentBuilder;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WifiPaymentBuilder);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
