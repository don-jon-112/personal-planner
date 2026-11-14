import { APIProxy } from '@/service/proxy';
export default async function handler(req: any, res: any) {
  const apiProxy = new APIProxy(req, res);
  return res.json((await apiProxy.makeRequest({ method: req.method, url: 'customer/v1/forward' })).data);
}
