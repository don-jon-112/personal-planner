const CMS = { post: (u: string, b?: any) => fetch(u, { method: 'POST', body: b }) };
export default CMS;
