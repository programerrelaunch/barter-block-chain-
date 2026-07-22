import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("BarterChain contracts", function () {
  let admin: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let op1: HardhatEthersSigner;
  let op2: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let settler: HardhatEthersSigner;
  let registry: any;
  let token: any;
  let settlement: any;

  beforeEach(async function () {
    [admin, treasury, op1, op2, buyer, seller, settler] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("ExchangeRegistry");
    registry = await Registry.deploy(admin.address);

    const Token = await ethers.getContractFactory("BarterToken");
    token = await Token.deploy(admin.address, await registry.getAddress());

    const Settlement = await ethers.getContractFactory("TradeSettlement");
    settlement = await Settlement.deploy(
      admin.address,
      await token.getAddress(),
      await registry.getAddress(),
      treasury.address
    );

    await token.grantRole(await token.MINTER_ROLE(), admin.address);
    await token.grantRole(await token.BURNER_ROLE(), admin.address);
    await settlement.grantRole(await settlement.SETTLER_ROLE(), settler.address);

    await registry.registerExchange(op1.address, "Bay Area Barter", 1000);
    await registry.registerExchange(op2.address, "Pacific Trade", 1000);
    await registry.connect(op1).registerMember(buyer.address, 1);
    await registry.connect(op1).registerMember(seller.address, 1);
  });

  it("uses 2 decimals", async function () {
    expect(await token.decimals()).to.equal(2);
  });

  it("settles in-network trade with 10% fee to operator", async function () {
    await token.mint(buyer.address, 10_000_00); // $10,000.00
    await token.connect(buyer).approve(await settlement.getAddress(), 10_000_00);
    await token.connect(seller).approve(await settlement.getAddress(), 1_000_00);

    const tradeRef = ethers.id("trade-1");
    await settlement
      .connect(settler)
      .settleTrade(buyer.address, seller.address, 10_000_00, tradeRef);

    expect(await token.balanceOf(buyer.address)).to.equal(0);
    expect(await token.balanceOf(seller.address)).to.equal(9_000_00);
    expect(await token.balanceOf(op1.address)).to.equal(1_000_00);
  });

  it("settles cross-network trade with 10/5 split", async function () {
    const crossSeller = (await ethers.getSigners())[7];
    await registry.connect(op2).registerMember(crossSeller.address, 2);

    await token.mint(buyer.address, 10_000_00);
    await token.connect(buyer).approve(await settlement.getAddress(), 10_000_00);
    await token.connect(crossSeller).approve(await settlement.getAddress(), 1_500_00);

    const tradeRef = ethers.id("trade-cross-1");
    await settlement
      .connect(settler)
      .settleTrade(buyer.address, crossSeller.address, 10_000_00, tradeRef);

    expect(await token.balanceOf(buyer.address)).to.equal(0);
    expect(await token.balanceOf(crossSeller.address)).to.equal(8_500_00);
    expect(await token.balanceOf(op2.address)).to.equal(1_000_00);
    expect(await token.balanceOf(treasury.address)).to.equal(500_00);
  });

  it("reverts when member is frozen", async function () {
    await token.mint(buyer.address, 100_00);
    await token.connect(op1).freeze(buyer.address);
    await expect(
      token.connect(buyer).transfer(seller.address, 10_00)
    ).to.be.revertedWithCustomError(token, "AccountFrozen");
  });

  it("reverts when exchange is suspended", async function () {
    await token.mint(buyer.address, 100_00);
    await registry.setExchangeActive(1, false);
    await expect(
      token.connect(buyer).transfer(seller.address, 10_00)
    ).to.be.revertedWithCustomError(token, "ExchangeSuspended");
  });

  it("supports credit mint → trade → earn → burn", async function () {
    // Buyer has $100, credit covers $400 shortfall for $500 purchase
    await token.mint(buyer.address, 100_00);
    await token.mint(buyer.address, 400_00); // credit authorization mint

    await token.connect(buyer).approve(await settlement.getAddress(), 500_00);
    await token.connect(seller).approve(await settlement.getAddress(), 50_00);

    await settlement
      .connect(settler)
      .settleTrade(buyer.address, seller.address, 500_00, ethers.id("credit-trade"));

    expect(await token.balanceOf(buyer.address)).to.equal(0);
    expect(await token.balanceOf(seller.address)).to.equal(450_00);

    // Seller later pays buyer $200; buyer burns $200 against debt
    await token.connect(seller).approve(await settlement.getAddress(), 200_00);
    await token.connect(buyer).approve(await settlement.getAddress(), 20_00);
    await settlement
      .connect(settler)
      .settleTrade(seller.address, buyer.address, 200_00, ethers.id("repay-earn"));

    expect(await token.balanceOf(buyer.address)).to.equal(180_00);
    await token.burn(buyer.address, 180_00);
    expect(await token.balanceOf(buyer.address)).to.equal(0);
  });

  it("rejects replayed tradeRef", async function () {
    await token.mint(buyer.address, 200_00);
    await token.connect(buyer).approve(await settlement.getAddress(), 200_00);
    await token.connect(seller).approve(await settlement.getAddress(), 20_00);
    const ref = ethers.id("once");
    await settlement.connect(settler).settleTrade(buyer.address, seller.address, 100_00, ref);
    await expect(
      settlement.connect(settler).settleTrade(buyer.address, seller.address, 100_00, ref)
    ).to.be.revertedWithCustomError(settlement, "TradeRefUsed");
  });
});
