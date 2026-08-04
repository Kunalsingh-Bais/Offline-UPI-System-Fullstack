import { TestBed } from '@angular/core/testing';

import { Receiver } from './receiver';

describe('Receiver', () => {
  let service: Receiver;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Receiver);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
