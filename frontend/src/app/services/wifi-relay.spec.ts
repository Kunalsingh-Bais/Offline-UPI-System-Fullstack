import { TestBed } from '@angular/core/testing';

import { WifiRelay } from './wifi-relay';

describe('WifiRelay', () => {
  let service: WifiRelay;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WifiRelay);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
