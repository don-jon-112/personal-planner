import { APIProxy } from '@/service/proxy';
export default async function handler(req: any, res: any) {
  const apiProxy = new APIProxy(req, res);
  switch (req.query.type) {
    case 'profile':
      return res.json((await apiProxy.makeRequest({ method: 'POST', url: 'saphybris-proxy/v1/profile' })).data);
    default:
      if (req.query.debug) {
        return res.json((await apiProxy.makeRequest({ method: 'GET', url: 'customer/v1/debug' })).data);
      }
      return res.json((await apiProxy.makeRequest({ method: 'GET', url: 'customer/v1/default' })).data);
  }
}
