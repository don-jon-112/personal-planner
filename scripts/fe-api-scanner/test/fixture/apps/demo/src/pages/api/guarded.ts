import { APIProxy } from '@/service/proxy';
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const apiProxy = new APIProxy(req, res);
  return res.json((await apiProxy.makeRequest({ method: req.method, url: 'customer/v1/guarded' })).data);
}
