import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "src/contracts/generated.ts",
  plugins: [
    foundry({
      project: "../../apps/contracts",
      // Use the top-level out/ paths only — subdirectory mirrors (protocol/, drivers/, etc.)
      // are excluded by listing only the exact artifacts we need.
      include: [
        "AddressDriver.sol/AddressDriver.json",
        "IDrips.sol/IDrips.json",
        "DripsFacetA.sol/DripsFacetA.json",
        "DripsFacetB.sol/DripsFacetB.json",
        "DripsRouter.sol/DripsRouter.json",
        "ERC20.sol/ERC20.json",
        "ZWERC20.sol/ZWERC20.json",
      ],
      // Exclude all subdirectory mirrors to prevent duplicate contract name errors
      exclude: [
        "protocol/**",
        "drivers/**",
        "yield/**",
        "privacy/**",
        "beacon/**",
        "cryptography/**",
        "extensions/**",
        "interfaces/**",
        "introspection/**",
        "math/**",
        "metatx/**",
        "mocks/**",
        "proxy/**",
        "script/**",
        "src/**",
        "structs/**",
        "test/**",
        "utils/**",
        "ERC20/**",
        "ERC1967/**",
      ],
    }),
  ],
});
