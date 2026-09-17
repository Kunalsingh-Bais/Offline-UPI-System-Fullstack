import { TestBed } from '@angular/core/testing';

import { WifiPayloadValidator } from './wifi-payload-validator';

describe('WifiPayloadValidator', () => {
  let service: WifiPayloadValidator;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WifiPayloadValidator);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
