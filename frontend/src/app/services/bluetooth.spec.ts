import { TestBed } from '@angular/core/testing';

import { Bluetooth } from './bluetooth';

describe('Bluetooth', () => {
  let service: Bluetooth;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Bluetooth);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
