export * from "./session";
export * from "./wallet";

import * as session from "./session";
import * as wallet from "./wallet";

export const api = {
  ...session,
  ...wallet,
};
