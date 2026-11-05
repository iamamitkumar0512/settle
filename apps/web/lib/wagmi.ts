import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { whitechainSepolia } from "./chains";

export const wagmiConfig = createConfig({
  chains: [whitechainSepolia],
  connectors: [injected()],
  transports: { [whitechainSepolia.id]: http() },
  ssr: true,
});
