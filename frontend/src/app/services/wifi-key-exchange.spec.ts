import { TestBed } from '@angular/core/testing';

import { WifiKeyExchange } from './wifi-key-exchange';

describe('WifiKeyExchange', () => {
  let service: WifiKeyExchange;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WifiKeyExchange);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
