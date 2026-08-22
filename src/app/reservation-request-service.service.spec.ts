import { TestBed } from '@angular/core/testing';

import { ReservationRequestServiceService } from './reservation-request-service.service';

describe('ReservationRequestServiceService', () => {
  let service: ReservationRequestServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReservationRequestServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
