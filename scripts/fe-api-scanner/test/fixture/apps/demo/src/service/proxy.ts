import APIInstance from 'ui/services/api';

export class APIProxy {
  constructor(_req: any, _res: any) {
    this.setup();
  }
  setup() {
    return APIInstance.post('/class/setup', null);
  }
  makeRequest(cfg: any) {
    return Promise.resolve({ data: cfg });
  }
  unusedHelper() {
    return APIInstance.get('/class/unused');
  }
}
