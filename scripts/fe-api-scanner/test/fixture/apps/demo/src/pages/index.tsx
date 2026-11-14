import { getUser, getCart, listBranch, withOptionalQuery, viaBasePath, stream } from '@/service/user';
export default function Home() {
  getUser(); getCart(true); listBranch(); withOptionalQuery(false); viaBasePath(); stream();
  return null;
}
