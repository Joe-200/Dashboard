import { TestBed } from '@angular/core/testing';

import { RoomResponseService } from './room-response.service';

describe('RoomResponseService', () => {
  let service: RoomResponseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoomResponseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
