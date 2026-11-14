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
export const stream = () => new EventSource(`${process.env.NEXT_PUBLIC_URL}/api/events`);
