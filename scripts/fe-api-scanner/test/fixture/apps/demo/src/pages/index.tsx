import { getUser, getCart, listBranch, withOptionalQuery, viaBasePath, guarded, forwardGet, forwardPost, upload, ocr, stream, download } from '@/service/user';
export default function Home() {
  getUser(); getCart(true); listBranch(); withOptionalQuery(false); viaBasePath(); guarded(); forwardGet(); forwardPost(); upload(null as any); ocr(null as any); stream(); download({ fileUrl: 'x' });
  return null;
}
