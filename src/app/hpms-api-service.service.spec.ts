import { TestBed } from '@angular/core/testing';

import { HpmsApiService } from './hpms-api-service.service';

describe('HpmsApiServiceService', () => {
  let service: HpmsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HpmsApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
