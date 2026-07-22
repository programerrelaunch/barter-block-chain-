import { ethers } from "hardhat";

function dollars(n: number): bigint {
  return BigInt(Math.round(n * 100));
}

function fmt(cents: bigint): string {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

async function main() {
  const signers = await ethers.getSigners();
  const [admin, treasury, op1, op2, op3, ...members] = signers;

  console.log("\n=== BarterChain Test Harness ===\n");

  const Registry = await ethers.getContractFactory("ExchangeRegistry");
  const registry = await Registry.deploy(admin.address);

  const Token = await ethers.getContractFactory("BarterToken");
  const token = await Token.deploy(admin.address, await registry.getAddress());

  const Settlement = await ethers.getContractFactory("TradeSettlement");
  const settlement = await Settlement.deploy(
    admin.address,
    await token.getAddress(),
    await registry.getAddress(),
    treasury.address
  );

  await token.grantRole(await token.MINTER_ROLE(), admin.address);
  await token.grantRole(await token.BURNER_ROLE(), admin.address);
  await settlement.grantRole(await settlement.SETTLER_ROLE(), admin.address);

  // 1–3. Register 3 exchanges + 10 members
  await registry.registerExchange(op1.address, "Bay Area Barter", 1000);
  await registry.registerExchange(op2.address, "Pacific Trade", 1200);
  await registry.registerExchange(op3.address, "Desert Mutual", 1000);

  const exchangeOps = [op1, op2, op3];
  for (let i = 0; i < 10; i++) {
    const exId = (i % 3) + 1;
    await registry.connect(exchangeOps[exId - 1]).registerMember(members[i].address, exId);
  }

  // 4. Mint starting balances
  for (let i = 0; i < 10; i++) {
    await token.mint(members[i].address, dollars(5_000));
  }

  const printBalances = async (label: string) => {
    console.log(`\n--- ${label} ---`);
    console.log(
      "Member".padEnd(12),
      "Ex".padEnd(4),
      "Balance".padStart(12),
      "Op1".padStart(12),
      "Op2".padStart(12),
      "Treasury".padStart(12)
    );
    for (let i = 0; i < 10; i++) {
      const bal = await token.balanceOf(members[i].address);
      const ex = await registry.memberHomeExchange(members[i].address);
      console.log(
        `M${i + 1}`.padEnd(12),
        String(ex).padEnd(4),
        fmt(bal).padStart(12),
        "".padStart(12),
        "".padStart(12),
        "".padStart(12)
      );
    }
    console.log(
      "Operators".padEnd(12),
      "".padEnd(4),
      "".padStart(12),
      fmt(await token.balanceOf(op1.address)).padStart(12),
      fmt(await token.balanceOf(op2.address)).padStart(12),
      fmt(await token.balanceOf(treasury.address)).padStart(12)
    );
  };

  await printBalances("Starting balances");

  // 5. In-network trade (M1 → M4, both exchange 1? M0 ex1, M1 ex2, M2 ex3, M3 ex1)
  // members[0] ex1, members[3] ex1
  const buyer = members[0];
  const seller = members[3];
  const settlementAddr = await settlement.getAddress();
  await token.connect(buyer).approve(settlementAddr, dollars(1_000));
  await token.connect(seller).approve(settlementAddr, dollars(100));
  await settlement.settleTrade(buyer.address, seller.address, dollars(1_000), ethers.id("in-network-1"));
  console.log("\n✓ In-network $1,000 trade settled (10% → Op1)");

  // 6. Cross-network (M0 ex1 → M1 ex2)
  const crossSeller = members[1];
  await token.connect(buyer).approve(settlementAddr, dollars(2_000));
  await token.connect(crossSeller).approve(settlementAddr, dollars(300));
  await settlement.settleTrade(
    buyer.address,
    crossSeller.address,
    dollars(2_000),
    ethers.id("cross-network-1")
  );
  console.log("✓ Cross-network $2,000 trade settled (10% Op2 / 5% treasury)");

  // 7. Freeze member
  await token.connect(op1).freeze(members[2].address);
  try {
    await token.connect(members[2]).transfer(members[5].address, dollars(10));
    console.log("✗ Freeze failed — transfer succeeded");
  } catch {
    console.log("✓ Frozen member transfer correctly reverted");
  }

  // 8. Suspend exchange 3
  await registry.setExchangeActive(3, false);
  try {
    await token.connect(members[5]).transfer(members[8].address, dollars(10));
    console.log("✗ Suspension failed — transfer succeeded");
  } catch {
    console.log("✓ Suspended exchange member transfer correctly reverted");
  }
  await registry.setExchangeActive(3, true);
  await token.connect(op1).unfreeze(members[2].address);

  // 9. Credit-line cycle
  const creditBuyer = members[6];
  await token.mint(creditBuyer.address, dollars(300)); // shortfall mint
  await token.connect(creditBuyer).approve(settlementAddr, dollars(800));
  await token.connect(members[0]).approve(settlementAddr, dollars(80));
  await settlement.settleTrade(
    creditBuyer.address,
    members[0].address,
    dollars(800),
    ethers.id("credit-cycle-1")
  );
  // Earn then burn
  await token.connect(members[3]).approve(settlementAddr, dollars(400));
  await token.connect(creditBuyer).approve(settlementAddr, dollars(40));
  await settlement.settleTrade(
    members[3].address,
    creditBuyer.address,
    dollars(400),
    ethers.id("credit-earn-1")
  );
  const repay = await token.balanceOf(creditBuyer.address);
  const burnAmt = repay > dollars(300) ? dollars(300) : repay;
  await token.burn(creditBuyer.address, burnAmt);
  console.log(`✓ Credit cycle complete (burned ${fmt(burnAmt)} against debt)`);

  await printBalances("Final balances");
  console.log("\n=== Harness complete ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
