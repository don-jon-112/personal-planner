export class APIProxy { constructor(_req: any, _res: any) {} makeRequest(cfg: any) { return Promise.resolve({ data: cfg }); } }
