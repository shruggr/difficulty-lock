# DifficultyLock

## Build

```sh
npm run build
```

## Testing Locally

```sh
npm run test
```

## Run Tests on the Bitcoin Testnet

```sh
npm run test:testnet
```

## Config

```
static readonly MAX_HEADERS = 52596n
// maximum number of block headers that can be processed in a single transaction call
// 52596n = 1 year's worth of blocks at 10 minutes per block.
// Smaller values will produce a smaller bitcoin transactions, but recordBlocks
// will need to be called more timesin order to unlock the contract
```

## Methods

### Constructor

- benificiary: Addr - recipient of funds if difficulty is reached
- issuer: Addr - issuer of contract
- satoshis: bigint - satoshis being locked in contract
- prevHeader: ByteString - previous block header. Submit a few block back to ensure - a reorg does not invalidate contract
- prevHeight: bigint - height associated with previous block header
- targetDifficulty: bigint - Difficulty which much be acheived to unlock contract
- requiredTargetCount: bigint - number of blocks at target difficulty required
- expirationHeight: bigint - Block height at which issuer can refund the contract

### recordBlocks

- sig: Sig - beneficiary signature
- pubkey: PubKey - beneficiary pubkey
- headers: ByteString - Up to `MAX_HEADERS` 80-byte block headers
- trailingOuts: ByteString - Transaction outputs after the contract output and before change output.

### refund

- sig: Sig - issuer signature
- pubkey: PubKey - issuer pubkey
  nLockTime must be on or after expiration height
  nSequence must be less that 0xffffffff

### transferBenificiary

- sig: Sig - beneficiary signature
- pubkey: PubKey - beneficiary pubkey
- benificiary: Addr - new beneficiary pubkeyhash
- trailingOuts: ByteString - Transaction outputs after the contract output and before change output.

### transferIssuer

- sig: Sig - issuer signature
- pubkey: PubKey - old issuer pubkey
- issuer: Addr - new issuer pubkeyhash
- trailingOuts: ByteString - Transaction outputs after the contract output and before change output.

### Convert to target from bits field in block

```
static bits2Target(bits: ByteString): bigint {
    const exponent = Utils.fromLEUnsigned(slice(bits, 3n))
    const coefficient = Utils.fromLEUnsigned(slice(bits, 0n, 3n))
    const n = 8n * (exponent - 3n)
    return lshift(coefficient, n)
}
```
