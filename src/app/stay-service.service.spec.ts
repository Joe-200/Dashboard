import { TestBed } from '@angular/core/testing';

import { StayServiceService } from './stay-service.service';

describe('StayServiceService', () => {
  let service: StayServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StayServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
