import axios from 'axios';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const api = axios.create({ baseURL: BASE_URL });
// forwarding helpers: `url` is their own parameter, so these are NOT endpoints
const APIInstance = {
  get: (url, cfg = {}) => api.get(url, cfg),
  post: (url, body, cfg = {}) => api.post(url, body, cfg),
  postFormData: (url, formData) => api.post(url, formData),
  postData: (base, url, data) => api.post(url, data, { baseURL: base }),
};
export default APIInstance;
