import { ethers } from "hardhat";

async function main() {
  const [admin, treasury] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("ExchangeRegistry");
  const registry = await Registry.deploy(admin.address);
  await registry.waitForDeployment();

  const Token = await ethers.getContractFactory("BarterToken");
  const token = await Token.deploy(admin.address, await registry.getAddress());
  await token.waitForDeployment();

  const Settlement = await ethers.getContractFactory("TradeSettlement");
  const settlement = await Settlement.deploy(
    admin.address,
    await token.getAddress(),
    await registry.getAddress(),
    treasury.address
  );
  await settlement.waitForDeployment();

  await token.grantRole(await token.MINTER_ROLE(), admin.address);
  await token.grantRole(await token.BURNER_ROLE(), admin.address);
  await token.grantRole(await token.BURNER_ROLE(), await settlement.getAddress());
  await settlement.grantRole(await settlement.SETTLER_ROLE(), admin.address);

  const addresses = {
    admin: admin.address,
    treasury: treasury.address,
    registry: await registry.getAddress(),
    token: await token.getAddress(),
    settlement: await settlement.getAddress(),
  };

  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
