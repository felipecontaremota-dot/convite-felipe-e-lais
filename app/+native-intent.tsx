import { safeSystemPath } from "../src/utils/systemLinks";
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return safeSystemPath(path);
}
