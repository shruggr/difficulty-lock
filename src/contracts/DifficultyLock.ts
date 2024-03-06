import {
    Addr,
    assert,
    bsv,
    ByteString,
    ContractTransaction,
    hash256,
    len,
    method,
    MethodCallOptions,
    prop,
    PubKey,
    Sig,
    slice,
    SmartContract,
    toByteString,
    Utils,
} from 'scrypt-ts'
import { Blockchain } from 'scrypt-ts-lib'
import { hash160 } from 'scryptlib'

export class DifficultyLock extends SmartContract {
    // maximum number of block headers that can be processed in a single transaction call
    // 52596n = 1 year's worth of blocks at 10 minutes per block.
    // Smaller values will produce a small bitcoin transactions, but recordBlocks will need to be called more times
    // in order to unlock the contract
    // static readonly MAX_HEADERS = 52596n
    static readonly MAX_HEADERS = 52n

    @prop(true)
    benificiary: Addr

    @prop(true)
    issuer: Addr

    @prop()
    satoshis: bigint

    @prop(true)
    prevHeader: ByteString

    @prop(true)
    prevHeight: bigint

    @prop()
    targetDifficulty: bigint

    @prop(true)
    requiredTargetCount: bigint

    @prop()
    expirationHeight: bigint

    @prop(true)
    benificiaryPayOut: ByteString

    @prop(true)
    issuerPayOut: ByteString

    constructor(
        benificiary: Addr,
        issuer: Addr,
        satoshis: bigint,
        prevHeader: ByteString,
        prevHeight: bigint,
        targetDifficulty: bigint,
        requiredTargetCount: bigint, // number of blocks at target difficulty required to unlock
        expirationHeight: bigint
    ) {
        super(...arguments)
        this.benificiary = benificiary
        this.issuer = issuer
        this.satoshis = satoshis
        this.prevHeader = prevHeader
        this.prevHeight = prevHeight
        this.targetDifficulty = targetDifficulty
        this.requiredTargetCount = requiredTargetCount
        this.expirationHeight = expirationHeight
        this.benificiaryPayOut = toByteString('')
        this.issuerPayOut = toByteString('')
    }

    @method()
    public recordBlocks(headers: ByteString, trailingOuts: ByteString) {
        assert(
            this.processHeaders(
                this.prevHeader,
                this.requiredTargetCount,
                headers
            ),
            'Invalid headers'
        )
        const outputs =
            Utils.buildPublicKeyHashOutput(this.benificiary, this.satoshis) +
            trailingOuts +
            this.buildChangeOutput()

        assert(
            hash256(outputs) === this.ctx.hashOutputs,
            `invalid outputs hash`
        )
    }

    @method()
    processHeaders(
        prevHeader: ByteString,
        remaining: bigint,
        headers: ByteString
    ): boolean {
        let fulfilled = false
        for (let i = 0n; i < DifficultyLock.MAX_HEADERS; i++) {
            if (!fulfilled && len(headers) >= 80n * (i + 1n)) {
                const header = slice(headers, 80n * i, 80n * i + 80n)
                assert(
                    slice(header, 4n, 36n) == hash256(prevHeader),
                    'Invalid block'
                )

                const bhHash = Utils.fromLEUnsigned(hash256(header))
                const target = Blockchain.bits2Target(slice(header, 72n, 76n))

                if (bhHash <= target && target <= this.targetDifficulty) {
                    remaining = remaining - 1n
                }

                if (remaining == 0n) {
                    fulfilled = true
                } else {
                    prevHeader = header
                }
            }
        }
        return fulfilled
    }

    @method()
    public refund(sig: Sig, pubkey: PubKey) {
        assert(this.ctx.locktime < 500000000, 'must use blockHeight locktime')
        assert(this.ctx.sequence < 0xffffffff, 'must use sequence locktime')
        assert(
            this.ctx.locktime >= this.expirationHeight,
            'expiration not reached'
        )

        assert(
            hash160(pubkey) == this.issuer,
            'Only the issuer can transfer the issuer'
        )
        assert(this.checkSig(sig, pubkey), 'Invalid signature')
    }

    @method()
    public updateBenificiary(
        sig: Sig,
        pubkey: PubKey,
        benificiary: Addr,
        benificaryPayOut: ByteString,
        trailingOuts: ByteString
    ) {
        assert(this.checkSig(sig, pubkey), 'Invalid signature')
        assert(
            hash160(pubkey) == this.benificiary,
            'Only the benificiary can transfer the benificiary'
        )

        this.benificiary = benificiary
        this.benificiaryPayOut = benificaryPayOut
        const outputs =
            this.buildStateOutput(this.satoshis) +
            trailingOuts +
            this.buildChangeOutput()

        assert(
            hash256(outputs) === this.ctx.hashOutputs,
            `invalid outputs hash`
        )
    }

    @method()
    public purchaseBeneficiary(benificiary: Addr, trailingOuts: ByteString) {
        const payOut = this.benificiaryPayOut
        this.benificiary = benificiary
        this.benificiaryPayOut = toByteString('')
        const outputs =
            this.buildStateOutput(this.satoshis) +
            payOut +
            trailingOuts +
            this.buildChangeOutput()

        assert(
            hash256(outputs) === this.ctx.hashOutputs,
            `invalid outputs hash `
        )
    }

    @method()
    public updateIssuer(
        sig: Sig,
        pubkey: PubKey,
        issuer: Addr,
        issuerPayOut: ByteString,
        trailingOuts: ByteString
    ) {
        assert(
            hash160(pubkey) == this.issuer,
            'Only the issuer can transfer the issuer'
        )
        assert(this.checkSig(sig, pubkey), 'Invalid signature')

        this.issuer = issuer
        this.issuerPayOut = issuerPayOut
        const outputs =
            this.buildStateOutput(this.satoshis) +
            trailingOuts +
            this.buildChangeOutput()
        assert(
            hash256(outputs) === this.ctx.hashOutputs,
            `invalid outputs hash`
        )
    }

    @method()
    public purchaseIssuer(issuer: Addr, trailingOuts: ByteString) {
        const payOut = this.issuerPayOut
        this.issuer = issuer
        this.issuerPayOut = toByteString('')
        const outputs =
            this.buildStateOutput(this.satoshis) +
            payOut +
            trailingOuts +
            this.buildChangeOutput()

        assert(
            hash256(outputs) === this.ctx.hashOutputs,
            `invalid outputs hash`
        )
    }

    static async recordBlocksTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        sig: Sig,
        pubkey: PubKey,
        headers: ByteString,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()

        const tx = new bsv.Transaction()
            .addInput(current.buildContractInput())
            .addOutput(
                new bsv.Transaction.Output({
                    script: bsv.Script.fromAddress(
                        bsv.Address.fromPublicKeyHash(
                            Buffer.from(next.benificiary, 'hex')
                        )
                    ),
                    satoshis: Number(next.satoshis),
                })
            )

        if (trailingOuts) {
            const br = new bsv.encoding.BufferReader(
                Buffer.from(trailingOuts, 'hex')
            )
            while (br.remaining() > 0) {
                const output = bsv.Transaction.Output.fromBufferReader(br)
                tx.addOutput(output)
            }
        }

        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }

    static async updateBenificiaryTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        sig: Sig,
        pubkey: PubKey,
        benificiary: Addr,
        benificaryPayOut: ByteString,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()
        next.benificiary = benificiary
        next.benificiaryPayOut = benificaryPayOut

        const tx = new bsv.Transaction().addInput(current.buildContractInput())
        tx.addOutput(
            new bsv.Transaction.Output({
                script: next.lockingScript,
                satoshis: Number(next.satoshis),
            })
        )

        if (trailingOuts) {
            const br = new bsv.encoding.BufferReader(
                Buffer.from(trailingOuts, 'hex')
            )
            while (br.remaining() > 0) {
                const output = bsv.Transaction.Output.fromBufferReader(br)
                tx.addOutput(output)
            }
        }

        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }

    static async purchaseBeneficiaryTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        benificiary: Addr,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()
        next.benificiary = benificiary
        const benificaryPayOut = next.benificiaryPayOut
        next.benificiaryPayOut = toByteString('')

        const tx = new bsv.Transaction()
            .addInput(current.buildContractInput())
            .addOutput(
                new bsv.Transaction.Output({
                    script: next.lockingScript,
                    satoshis: Number(next.satoshis),
                })
            )
            .addOutput(
                bsv.Transaction.Output.fromBufferReader(
                    new bsv.encoding.BufferReader(
                        Buffer.from(benificaryPayOut, 'hex')
                    )
                )
            )

        if (trailingOuts) {
            const br = new bsv.encoding.BufferReader(
                Buffer.from(trailingOuts, 'hex')
            )
            while (br.remaining() > 0) {
                const output = bsv.Transaction.Output.fromBufferReader(br)
                tx.addOutput(output)
            }
        }
        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }

    static async updateIssuerTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        sig: Sig,
        pubkey: PubKey,
        issuer: Addr,
        issuerPayOut: ByteString,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()
        next.issuer = issuer
        next.issuerPayOut = issuerPayOut

        const tx = new bsv.Transaction().addInput(current.buildContractInput())
        tx.addOutput(
            new bsv.Transaction.Output({
                script: next.lockingScript,
                satoshis: Number(next.satoshis),
            })
        )

        if (trailingOuts) {
            const br = new bsv.encoding.BufferReader(
                Buffer.from(trailingOuts, 'hex')
            )
            while (br.remaining() > 0) {
                const output = bsv.Transaction.Output.fromBufferReader(br)
                tx.addOutput(output)
            }
        }

        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }

    static async purchaseIssuerTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        issuer: Addr,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()
        const issuerPayOut = next.issuerPayOut
        next.issuer = issuer
        next.issuerPayOut = toByteString('')

        const tx = new bsv.Transaction()
            .addInput(current.buildContractInput())
            .addOutput(
                new bsv.Transaction.Output({
                    script: next.lockingScript,
                    satoshis: Number(next.satoshis),
                })
            )
            .addOutput(
                bsv.Transaction.Output.fromBufferReader(
                    new bsv.encoding.BufferReader(
                        Buffer.from(issuerPayOut, 'hex')
                    )
                )
            )

        if (trailingOuts) {
            const br = new bsv.encoding.BufferReader(
                Buffer.from(trailingOuts, 'hex')
            )
            while (br.remaining() > 0) {
                const output = bsv.Transaction.Output.fromBufferReader(br)
                tx.addOutput(output)
            }
        }

        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }
}
