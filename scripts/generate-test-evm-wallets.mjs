#!/usr/bin/env node
import { Wallet } from 'ethers';

const args = process.argv.slice(2);
const count = readCount(args);
const asJson = args.includes('--json');
const asEnv = args.includes('--env');

const wallets = Array.from({ length: count }, (_, index) => {
  const wallet = Wallet.createRandom();
  return {
    index: index + 1,
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
  };
});

if (asJson) {
  console.log(JSON.stringify(wallets, null, 2));
} else if (asEnv) {
  printEnv(wallets);
} else {
  printHuman(wallets);
}

function readCount(values) {
  const rawCount = values.find((value) => /^\d+$/.test(value));
  if (rawCount === undefined) {
    return 1;
  }

  const parsed = Number.parseInt(rawCount, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error('Wallet count must be between 1 and 50.');
  }

  return parsed;
}

function printHuman(generatedWallets) {
  console.log('Generated test EVM wallet(s). Do not use these for mainnet funds.');
  console.log('');

  for (const wallet of generatedWallets) {
    console.log(`Wallet ${wallet.index}`);
    console.log(`  Address:     ${wallet.address}`);
    console.log(`  Private key: ${wallet.privateKey}`);
    if (wallet.mnemonic !== undefined) {
      console.log(`  Mnemonic:    ${wallet.mnemonic}`);
    }
    console.log('');
  }

  if (generatedWallets[0] !== undefined) {
    console.log('For the 0G live smoke test, fund the address with testnet tokens and set:');
    console.log(`AGENTIO_0G_PRIVATE_KEY=${generatedWallets[0].privateKey}`);
  }
}

function printEnv(generatedWallets) {
  for (const wallet of generatedWallets) {
    const suffix = generatedWallets.length === 1 ? '' : `_${wallet.index}`;
    console.log(`TEST_EVM_ADDRESS${suffix}=${wallet.address}`);
    console.log(`TEST_EVM_PRIVATE_KEY${suffix}=${wallet.privateKey}`);
  }

  if (generatedWallets[0] !== undefined) {
    console.log(`AGENTIO_0G_PRIVATE_KEY=${generatedWallets[0].privateKey}`);
  }
}
