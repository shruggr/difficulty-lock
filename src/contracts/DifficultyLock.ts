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

type DifficultyLockState = {
    header: ByteString
    height: bigint
    fulfilled: boolean
    remaining: bigint
}

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

    @prop()
    expirationHeight: bigint

    @prop(true)
    remaining: bigint

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
        this.remaining = requiredTargetCount
        this.expirationHeight = expirationHeight
    }

    @method()
    public recordBlocks(
        sig: Sig,
        pubkey: PubKey,
        headers: ByteString,
        trailingOuts: ByteString
    ) {
        assert(
            hash160(pubkey) == this.benificiary,
            'Only the benificiary can increment the block'
        )
        assert(this.checkSig(sig, pubkey), 'Invalid signature')
        const callState = this.processHeaders(
            {
                header: this.prevHeader,
                height: this.prevHeight,
                fulfilled: false,
                remaining: this.remaining,
            },
            headers
        )

        let outputs = toByteString('', false)
        if (!callState.fulfilled) {
            this.prevHeader = callState.header
            this.prevHeight = callState.height
            this.remaining = callState.remaining
            outputs = this.buildStateOutput(this.satoshis)
        }
        outputs += trailingOuts + this.buildChangeOutput()

        assert(
            hash256(outputs) === this.ctx.hashOutputs,
            `invalid outputs hash`
        )
    }

    @method()
    processHeaders(
        callState: DifficultyLockState,
        headers: ByteString
    ): DifficultyLockState {
        for (let i = 0n; i < DifficultyLock.MAX_HEADERS; i++) {
            if (!callState.fulfilled && len(headers) >= 80n * (i + 1n)) {
                const header = slice(headers, 80n * i, 80n * i + 80n)
                assert(
                    slice(header, 4n, 36n) == hash256(callState.header),
                    'Invalid block'
                )

                const bhHash = Utils.fromLEUnsigned(hash256(header))
                const target = Blockchain.bits2Target(slice(header, 72n, 76n))

                if (bhHash <= target && target <= this.targetDifficulty) {
                    callState.remaining = callState.remaining - 1n
                }

                if (callState.remaining == 0n) {
                    callState.fulfilled = true
                } else {
                    callState.header = header
                    callState.height = callState.height + 1n
                }
            }
        }
        return callState
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
    public transferBenificiary(
        sig: Sig,
        pubkey: PubKey,
        benificiary: Addr,
        trailingOuts: ByteString
    ) {
        assert(this.checkSig(sig, pubkey), 'Invalid signature')
        assert(
            hash160(pubkey) == this.benificiary,
            'Only the benificiary can transfer the benificiary'
        )

        this.benificiary = benificiary
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
    public transferIssuer(
        sig: Sig,
        pubkey: PubKey,
        issuer: Addr,
        trailingOuts: ByteString
    ) {
        assert(
            hash160(pubkey) == this.issuer,
            'Only the issuer can transfer the issuer'
        )
        assert(this.checkSig(sig, pubkey), 'Invalid signature')

        this.issuer = issuer
        const outputs =
            this.buildStateOutput(this.satoshis) +
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
        const callState = next.processHeaders(
            {
                header: next.prevHeader,
                height: next.prevHeight,
                fulfilled: false,
                remaining: next.remaining,
            },
            headers
        )

        const tx = new bsv.Transaction().addInput(current.buildContractInput())

        if (!callState.fulfilled) {
            next.prevHeader = callState.header
            next.prevHeight = callState.height
            next.remaining = callState.remaining
            tx.addOutput(
                new bsv.Transaction.Output({
                    script: next.lockingScript,
                    satoshis: Number(next.satoshis),
                })
            )
        }

        const br = new bsv.encoding.BufferReader(
            Buffer.from(trailingOuts, 'hex')
        )
        while (!br.eof) {
            tx.addOutput(bsv.Transaction.Output.fromBufferReader(br))
        }
        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }

    static async transferBenificiaryTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        sig: Sig,
        pubkey: PubKey,
        benificiary: Addr,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()
        next.benificiary = benificiary

        const tx = new bsv.Transaction().addInput(current.buildContractInput())
        tx.addOutput(
            new bsv.Transaction.Output({
                script: next.lockingScript,
                satoshis: Number(next.satoshis),
            })
        )

        const br = new bsv.encoding.BufferReader(
            Buffer.from(trailingOuts, 'hex')
        )
        while (!br.eof) {
            tx.addOutput(bsv.Transaction.Output.fromBufferReader(br))
        }

        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }

    static async transferIssuerTxBuilder(
        current: DifficultyLock,
        options: MethodCallOptions<DifficultyLock>,
        sig: Sig,
        pubkey: PubKey,
        issuer: Addr,
        trailingOuts: ByteString
    ): Promise<ContractTransaction> {
        const defaultAddress = await current.signer.getDefaultAddress()

        const next = current.next()
        next.issuer = issuer

        const tx = new bsv.Transaction().addInput(current.buildContractInput())
        tx.addOutput(
            new bsv.Transaction.Output({
                script: next.lockingScript,
                satoshis: Number(next.satoshis),
            })
        )

        const br = new bsv.encoding.BufferReader(
            Buffer.from(trailingOuts, 'hex')
        )
        while (!br.eof) {
            tx.addOutput(bsv.Transaction.Output.fromBufferReader(br))
        }

        tx.change(options.changeAddress || defaultAddress)

        return { tx, atInputIndex: 0, nexts: [] }
    }
}
