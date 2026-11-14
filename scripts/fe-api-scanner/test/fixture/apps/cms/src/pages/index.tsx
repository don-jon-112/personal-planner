import APIInstance from 'ui/services/api';
export default function Cms() {
  APIInstance.get('/cms/only');
  return null;
}
