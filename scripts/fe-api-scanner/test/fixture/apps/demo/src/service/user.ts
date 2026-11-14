import APIInstance from 'ui/services/api';
import CMS from './apiCMS';

export const getUser = () => APIInstance.get('/customer/v1/user');
export const getCart = (isDev: boolean) => {
  const path = isDev ? '/api/global-cart' : 'global-cart';
  return APIInstance.get(path);
};
export const listBranch = () => CMS.post('branch/list', {});
export const withOptionalQuery = (showAll: boolean) => APIInstance.get('after-sales/category/list' + (showAll ? '?showAll=true' : ''));
export const unusedService = () => APIInstance.post('/dead/code', {});
export const viaBasePath = () => APIInstance.get('/demo/api/proxy', { baseURL: process.env.NEXT_PUBLIC_BASEPATH_URL });
export const guarded = () => APIInstance.post('/api/guarded', {});
export const forwardGet = () => APIInstance.get('/api/forward');
export const forwardPost = () => APIInstance.post('/api/forward', {});
export const upload = (fd: FormData) => APIInstance.postFormData('/saphybris-proxy/v1/upload-doc', fd);
export const ocr = (file: File) => APIInstance.postData(process.env.NEXT_PUBLIC_OCR_URL, 'ocr/scan', { file });
export const stream = () => new EventSource(`${process.env.NEXT_PUBLIC_BASE_URL}/events/stream`);
export const download = (item: { fileUrl: string }) => fetch(item.fileUrl); // not an API: annotated
export const checkOnServer = (req: any, res: any) => new (require('@/service/proxy').APIProxy)(req, res);
