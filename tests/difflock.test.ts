import { expect, use } from 'chai'
import {
    Addr,
    bsv,
    findSig,
    MethodCallOptions,
    PubKey,
    toByteString,
    toHex,
} from 'scrypt-ts'
import { DifficultyLock } from '../src/contracts/DifficultyLock'
import { getDefaultSigner, randomPrivateKey } from './utils/txHelper'
import chaiAsPromised from 'chai-as-promised'
import { Blockchain } from 'scrypt-ts-lib'
use(chaiAsPromised)

const [initPriv, initPub, initPkh, initAdd] = randomPrivateKey()
const [benPriv, benPub, benPkh, benAdd] = randomPrivateKey()
const [issPriv, issPub, issPkh, issAdd] = randomPrivateKey()

const bh577267 = toByteString(
    '070000206a69fce3949dd23becc8d9ab6839ea24f18066209f143a8a9322000000000000ef3f432052cd15b3e2b7c738740f480b9523d38c260da48a8fb7476ca911275f8b571956340b351a71b3c82d'
)

describe('Test SmartContract `DifficultyLock`', () => {
    // let instance: DifficultyLock

    before(async () => {
        await DifficultyLock.loadArtifact()
    })

    it('should transfer issuer.', async () => {
        const instance = new DifficultyLock(
            Addr(benPkh.toString('hex')),
            Addr(initPkh.toString('hex')),
            100n,
            bh577267,
            577267n,
            Blockchain.bits2Target(toByteString('1a350b34')),
            1n,
            577277n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'updateIssuer',
            DifficultyLock.updateIssuerTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        const callRes = await instance.methods.updateIssuer(
            (sigReqs) => findSig(sigReqs, initPub),
            PubKey(toHex(initPub)),
            Addr(issPkh.toString('hex')),
            toByteString(''),
            toByteString(''),
            {
                changeAddress: issAdd,
                pubKeyOrAddrToSign: initPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "updateIssuer" method: ${callRes.tx.id}`)
    })

    it('should transfer benificiary.', async () => {
        const instance = new DifficultyLock(
            Addr(initPkh.toString('hex')),
            Addr(issPkh.toString('hex')),
            100n,
            bh577267,
            577267n,
            Blockchain.bits2Target(toByteString('1a350b34')),
            1n,
            577277n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'updateBenificiary',
            DifficultyLock.updateBenificiaryTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        const callRes = await instance.methods.updateBenificiary(
            (sigReqs) => findSig(sigReqs, initPub),
            PubKey(initPub.toHex()),
            Addr(benPkh.toString('hex')),
            toByteString(''),
            toByteString(''),
            {
                changeAddress: benAdd,
                pubKeyOrAddrToSign: initPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "updateBenificiary" method: ${callRes.tx.id}`)
    })

    it('should record blocks.', async () => {
        const bh1M = toByteString(
            '000000201af2487466dc0437a1fc545740abd82c9d51b5a4bab9e5fea5082200000000000b209c935968affb31bd1288e66203a2b635b902a2352f7867b85201f6baaf09044d0758c0cc521bd1cf559f'
        )
        const bh1M1 = toByteString(
            '00000020148484cce68f27995e954763946f620601ebbeaf2fda3e9a258e4700000000004dc2535c8e64cfc021efc0a03df585c838e60741c75ccba1c6d59e3db03070cbfb4c0758c0cc521b71b6dead'
        )
        const instance = new DifficultyLock(
            Addr(benPkh.toString('hex')),
            Addr(issPkh.toString('hex')),
            100n,
            bh1M,
            1000000n,
            Blockchain.bits2Target(toByteString('1c27b3c0')),
            1n,
            1100000n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'recordBlocks',
            DifficultyLock.recordBlocksTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        const callRes = await instance.methods.recordBlocks(
            bh1M1,
            toByteString(''),
            {
                changeAddress: benAdd,
                pubKeyOrAddrToSign: benPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "recordBlocks" method: ${callRes.tx.id}`)
    })

    it('should fail with invalid blocks.', async () => {
        const instance = new DifficultyLock(
            Addr(benPkh.toString('hex')),
            Addr(issPkh.toString('hex')),
            100n,
            bh577267,
            577267n,
            Blockchain.bits2Target(toByteString('1a350b34')),
            1n,
            577277n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'recordBlocks',
            DifficultyLock.recordBlocksTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        const call = async () =>
            instance.methods.recordBlocks(
                toByteString(
                    '0300000034396f827db1fabda26ea0a1c66b74f1b72c092327a126a9462e0000000000000499350778884725469e0a4fd7a782f79b9e272ccaba9f21f10f7891f566960a38571956340b351a11f71ec9'
                ),
                toByteString(''),
                {
                    changeAddress: benAdd,
                    pubKeyOrAddrToSign: benPub,
                } as MethodCallOptions<DifficultyLock>
            )

        await expect(call()).to.be.rejected
    })

    it('should pass the public method unit test successfully.', async () => {
        const instance = new DifficultyLock(
            Addr(benPkh.toString('hex')),
            Addr(issPkh.toString('hex')),
            100n,
            bh577267,
            577267n,
            Blockchain.bits2Target(toByteString('1a350b34')),
            1n,
            577277n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        // instance.bindTxBuilder('refund', DifficultyLock.refundTxBuilder)

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        const callRes = await instance.methods.refund(
            (sigReqs) => findSig(sigReqs, issPub),
            PubKey(toHex(issPub)),
            {
                changeAddress: issAdd,
                pubKeyOrAddrToSign: issPub,
                lockTime: Number(instance.expirationHeight),
                sequence: 0,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "refund" method: ${callRes.tx.id}`)
    })

    it('should record multiple blocks across multiple calls', async () => {
        const bh1M = toByteString(
            '000000201af2487466dc0437a1fc545740abd82c9d51b5a4bab9e5fea5082200000000000b209c935968affb31bd1288e66203a2b635b902a2352f7867b85201f6baaf09044d0758c0cc521bd1cf559f'
        )
        const bh1M1 = toByteString(
            '00000020148484cce68f27995e954763946f620601ebbeaf2fda3e9a258e4700000000004dc2535c8e64cfc021efc0a03df585c838e60741c75ccba1c6d59e3db03070cbfb4c0758c0cc521b71b6dead'
        )
        const bh1M2 = toByteString(
            '00000020f9283c273ac0134b4eec1e397fe0c5bb59b3a545e10c480be6321f00000000001720916f0a4385ebc4c74877dd2ef4ee059fa5f8b0f3736fe35e9bdbd37fd2d2264d0758c0cc521b64e4b5a4'
        )
        const bh1M3 = toByteString(
            '00000020ea9bf7b2a7a4d6f49981e05aadf5d4221e8cf26bb04b798a96f6000000000000018d9f9ad58a2bbd61535041045183c16e42f49a7b0c4b40ab6f781bc2abc93f184d0758c0cc521be700826e'
        )
        const bh1M4 = toByteString(
            '000000201a7e16123cae1358864eae1bcc1dbe443a1baf1963d4e6f128d315000000000056b4a4f743341c6e7da170892036effffa7f83851a5ffcec88585438c002e31c084d0758c0cc521b303178a1'
        )
        const bh1M5 = toByteString(
            '000000201d77cbef288470e2926358379564d675f15418df84dd8292f1990f0000000000686cc01a43cf102dcb749bd44b2694ca5169a124a64aa5b25a2c1827d9d50d29254d0758c0cc521b6281d04e'
        )

        const instance = new DifficultyLock(
            Addr(benPkh.toString('hex')),
            Addr(issPkh.toString('hex')),
            100n,
            bh1M,
            1000000n,
            Blockchain.bits2Target(toByteString('1b52ccc0')),
            5n,
            1100000n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'recordBlocks',
            DifficultyLock.recordBlocksTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        const callRes = await instance.methods.recordBlocks(
            bh1M1 + bh1M2 + bh1M3 + bh1M4 + bh1M5,
            toByteString(''),
            {
                changeAddress: benAdd,
                pubKeyOrAddrToSign: benPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(
            `Called "recordBlocks" 1 method: ${callRes.tx.id} ${instance.prevHeight} ${instance.prevHeader}`
        )
    })

    it('should allow listing and purchasing of benificiary', async () => {
        let instance = new DifficultyLock(
            Addr(initPkh.toString('hex')),
            Addr(initPkh.toString('hex')),
            100n,
            bh577267,
            577267n,
            Blockchain.bits2Target(toByteString('1a350b34')),
            1n,
            577277n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'updateBenificiary',
            DifficultyLock.updateBenificiaryTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        let callRes = await instance.methods.updateBenificiary(
            (sigReqs) => findSig(sigReqs, initPub),
            PubKey(initPub.toHex()),
            toByteString(initPkh.toString('hex')),
            toByteString(
                new bsv.Transaction.Output({
                    satoshis: 1000,
                    script: bsv.Script.buildPublicKeyHashOut(initAdd),
                })
                    .toBufferWriter()
                    .toBuffer()
                    .toString('hex')
            ),
            // test trailing outputs
            toByteString(
                new bsv.Transaction.Output({
                    satoshis: 1000,
                    script: bsv.Script.buildPublicKeyHashOut(initAdd),
                })
                    .toBufferWriter()
                    .toBuffer()
                    .toString('hex')
            ),
            {
                changeAddress: initAdd,
                pubKeyOrAddrToSign: initPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "updateBenificiary" 1 method: ${callRes.tx.id}`)

        instance = DifficultyLock.fromTx(callRes.tx, 0)
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'purchaseBeneficiary',
            DifficultyLock.purchaseBeneficiaryTxBuilder
        )
        console.log('benificiaryPayOut', instance.benificiaryPayOut)
        callRes = await instance.methods.purchaseBeneficiary(
            toByteString(benPkh.toString('hex')),
            // test trailing outputs
            toByteString(
                new bsv.Transaction.Output({
                    satoshis: 1000,
                    script: bsv.Script.buildPublicKeyHashOut(initAdd),
                })
                    .toBufferWriter()
                    .toBuffer()
                    .toString('hex')
            ),
            {
                changeAddress: benAdd,
                pubKeyOrAddrToSign: benPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "purchaseBeneficiary" 1 method: ${callRes.tx.id}`)

        instance = DifficultyLock.fromTx(callRes.tx, 0)
        expect(
            instance.benificiary === benPkh.toString('hex'),
            'benificiary should be updated'
        ).to.be.true
    })

    it('should allow listing and purchasing of issuer', async () => {
        let instance = new DifficultyLock(
            Addr(initPkh.toString('hex')),
            Addr(initPkh.toString('hex')),
            100n,
            bh577267,
            577267n,
            Blockchain.bits2Target(toByteString('1a350b34')),
            1n,
            577277n
        )
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'updateIssuer',
            DifficultyLock.updateIssuerTxBuilder
        )

        const deployTx = await instance.deploy(100)
        console.log(`Deployed contract "DifficultyLock": ${deployTx.id}`)

        let callRes = await instance.methods.updateIssuer(
            (sigReqs) => findSig(sigReqs, initPub),
            PubKey(initPub.toHex()),
            toByteString(initPkh.toString('hex')),
            toByteString(
                new bsv.Transaction.Output({
                    satoshis: 1000,
                    script: bsv.Script.buildPublicKeyHashOut(initAdd),
                })
                    .toBufferWriter()
                    .toBuffer()
                    .toString('hex')
            ),
            toByteString(''),
            {
                changeAddress: initAdd,
                pubKeyOrAddrToSign: initPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "updateIssuer" 1 method: ${callRes.tx.id}`)

        instance = DifficultyLock.fromTx(callRes.tx, 0)
        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'purchaseIssuer',
            DifficultyLock.purchaseIssuerTxBuilder
        )

        callRes = await instance.methods.purchaseIssuer(
            toByteString(issPkh.toString('hex')),
            toByteString(''),
            {
                changeAddress: benAdd,
                pubKeyOrAddrToSign: benPub,
            } as MethodCallOptions<DifficultyLock>
        )

        console.log(`Called "purchaseIssuer" 1 method: ${callRes.tx.id}`)

        instance = DifficultyLock.fromTx(callRes.tx, 0)
        expect(
            instance.issuer === issPkh.toString('hex'),
            'issuer should be updated'
        ).to.be.true

        await instance.connect(getDefaultSigner([initPriv, benPriv, issPriv]))
        instance.bindTxBuilder(
            'purchaseIssuer',
            DifficultyLock.purchaseIssuerTxBuilder
        )

        const call = () =>
            instance.methods.purchaseIssuer(
                toByteString(issPkh.toString('hex')),
                toByteString(''),
                {
                    changeAddress: benAdd,
                    pubKeyOrAddrToSign: benPub,
                } as MethodCallOptions<DifficultyLock>
            )

        await expect(call()).to.be.rejected
    })
})
