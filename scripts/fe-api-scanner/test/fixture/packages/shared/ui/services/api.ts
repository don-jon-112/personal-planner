import axios from 'axios';
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_BASE_URL });
// forwarding helper: `url` is its own parameter, so this is NOT an endpoint
const APIInstance = {
  get: (url, cfg = {}) => api.get(url, cfg),
  post: (url, body) => api.post(url, body),
};
export default APIInstance;
