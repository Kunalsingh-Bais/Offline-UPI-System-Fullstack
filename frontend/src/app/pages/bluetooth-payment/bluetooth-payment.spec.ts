import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BluetoothPayment } from './bluetooth-payment';

describe('BluetoothPayment', () => {
  let component: BluetoothPayment;
  let fixture: ComponentFixture<BluetoothPayment>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BluetoothPayment],
    }).compileComponents();

    fixture = TestBed.createComponent(BluetoothPayment);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
