import { TestBed } from '@angular/core/testing';

import { Nonce } from './nonce';

describe('Nonce', () => {
  let service: Nonce;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Nonce);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
