import { ParamsAddress, AuthorityAddress, EnergyAddress, ExecutorAddress, PrototypeAddress, ExtensionAddress } from './address'
import { Network } from './network'

const uint8ToAddress = (input: number) => ('0x' + Buffer.alloc(1).fill(input).toString('hex').padStart(40, '0'))

export const preCompiledContract = [
    uint8ToAddress(0x1),
    uint8ToAddress(0x2),
    uint8ToAddress(0x3),
    uint8ToAddress(0x4),
    uint8ToAddress(0x5),
    uint8ToAddress(0x6),
    uint8ToAddress(0x7),
    uint8ToAddress(0x8)
]

export const IstPreCompiledContract = [
    uint8ToAddress(0x9)
]

export const getPreAllocAccount = (net: Network) => {
    if (net === Network.MainNet) {
        return [
            ParamsAddress,
            AuthorityAddress,
            EnergyAddress,
            ExecutorAddress,
            PrototypeAddress,
            ExtensionAddress,
            ...preCompiledContract,
            ...mainnet
        ]
    } else if (net === Network.TestNet) {
        return [
            ParamsAddress,
            AuthorityAddress,
            EnergyAddress,
            PrototypeAddress,
            ExtensionAddress,
            ...preCompiledContract,
            ...testnet
        ]
    } else {
        throw new Error('unknown network: ' + net)
    }
}

const mainnet = [
    '0x137053dfbe6c0a43f915ad2efefefdcc2708e975',
    '0xaf111431c1284a5e16d2eecd2daed133ce96820e',
    '0x997522a4274336f4b86af4a6ed9e45aedcc6d360',
    '0x0bd7b06debd1522e75e4b91ff598f107fd826c8a',
    '0xb3a4831cadcee1efb78028c2ba72f29f22a197e1',
    '0x9366662519dc456bd5b8bc4ee4b6852338d82f08',
    '0xce42d8faf4694840eb54ac0006c59d3024f64b75',
    '0xc83e49f3abf2ce3794b66d14adc2176bad1be6e7',
    '0xf42d0a0df8cfb2a9269511f1a6ba0e9e38c4b497',
    '0xd6d918cb7870c5752fe033c3461db32bcdb64fbd',
    '0x1978fd27183aae3116dde718df7a6372bd6f8a9a',
    '0xb447ab2851f9a485cfbb21305c4896b45f9bc0dd',
    '0x21d38fdf726c138ae73c78075159a4ece3130ee2',
    '0xe20a2347081bb1328532978fe896ee13c536d7ba',
    '0xda5f12f45b42a207e58b8d430fcde11c0b54e68d',
    '0x986501e98957f36c933ca419f060281c9c35dc41',
    '0x057bc0107d9039b3cc346958ed38e961032d3dc6',
    '0x1a6cd62f72315b926e7310e330d84b26db32dd85',
    '0xb5358b034647202d0cd3d1bf615e63e498e02682',
    '0xe03388a87f0d2e56701048b3b41a4ca0ab068da7',
    '0xa906fe50b3a807a7ab0205051ac3a1f2211af613',
    '0x0870089330741c126d92bf5759011bb31e24873f',
    '0x4fc5342543e6d2dc34fc410d266692bc45c483f9',
    '0x77efe1bb436ca9d6537219681ae76e9de2c79ef5',
    '0xeb0c565f69557481c6c7fa347cae273128a0996e',
    '0xc8be0902a99f4acf0fcfa2e2462eb3c6774725d6',
    '0x049db80366ec1509d96acef90e7974a66c7fe0ae',
    '0x80737961e5fee5ee7ece81564d66e47179a02a84',
    '0x63559f24a8f38cf1ed2f6f5ba67c6fdd08432cd1',
    '0xa78994bbeddc697dd540de178a6ee66c240374a0',
    '0xd51666c6b4fed6070a78691f1f3c8e79ad02e3a0',
    '0x7dfdcd8a4559c285a3af242472d9d11289a8e46e',
    '0x94afc0c08ee7d3cd1540a51eece705dbadc3dedc',
    '0x224626926a7a12225a60e127cec119c939db4a5c',
    '0xe32499b4143830f2526c79d388ecee530b6357aa',
    '0x9d3002f06bf33a5d2cf0839c0298739963e48bbf',
    '0x987b68e1b71d87b82ffce7539ae95b1b11ac7eb0',
    '0x15dcee2cde4fafad607c4f3e9629dd94486e14d0',
    '0x14b18a1cd33e43eb72aaf1b8c65e2f9f067c4176',
    '0x2034e870f70627a54dcdd6ace147feb046ec061d',
    '0xd11ec91d6a52783d19641e21dd1d0b4060e58754',
    '0x0a10597f29733bedfad7520a3a7031b97368de11',
    '0xf691f4024582203634388fd5fc513c9cbc897942',
    '0x69e3776ffebfabe68b59ce5797a4832ec2f89a19',
    '0xe3fecc11358e51d4ddc317e631c0f5e648dde0fd',
    '0x11e698a23aa16df7485638b76be943b27371b921',
    '0x9a1e4bf6c41f50c399a128ab588fe4e4883bd872',
    '0x2c59c15af29dcfe4d4601af3f50f943bd215f62d',
    '0xb57ff89e8427ea5c477bed2083970a4493862194',
    '0xadf25ed7814c8b978f2cfd1de663d8f6b84145a0',
    '0xaad9fa35d309e5f6da821376634febe0db201e51',
    '0x77bb58f46440c51e0990b9c0a28bae3e24fe25d9',
    '0x0acc7bfc8f7d904fe4a35f32f529217c7ca75377',
    '0x5643143716537c9c86c558091d2a30710f71fec7',
    '0x190b8d3d0fc0946ea58b7ae52c9ea77338dd5613',
    '0x555f26a336e36959d07bc58dab13e562a3b3a200',
    '0xa9e5617e2f90427f6db70a3b1d08fc14706eb907',
    '0xf17e6c22f9eedfc8fd2f731da9b9154b87354764',
    '0xd5efb9c70c006bcf92b9ce60cda27a282229011d',
    '0x807f7a34045eec8796cf9c1fca049348544361a9',
    '0xe0988034941c87fc18d3eae188a08955f8779cce',
    '0x2265d467ec73fdd2f1e4f513d05c09b910707823',
    '0x7dae11b4b67d0012bab625ab5cf0894e35b713bf',
    '0xe446ad66616fb97659c84d868357b99c0418836f',
    '0x54f6f89138b7ff8131fa76485d1a81cc1e8fe2b7',
    '0xa1cba33c939a5f8956b760970be3c06666c9103d',
    '0x352f2753c668d9c970fc0f7bf54c0fce628b97a4',
    '0x319c810685881d61910df826ff4982841f459a26',
    '0xed4bb97cde61db2c397772d760a46679fd5fe92d',
    '0x2c593298dc0913e2bb43b383be74132dd3d98e0c',
    '0xb72f547b16c8ad64f28d698c7af5b38c8a1166f0',
    '0x0da8fa475c8272d21be204fe8112d1e2cd698c96',
    '0x65c620071eb78f201d4fe41a191ebd031809fca2',
    '0x7db64d97c157e863a49004e582fa66d0d6129ca5',
    '0xc3ed88082a22c41d31ab2c7484ff4530a7bd945e',
    '0x62131a2c1181e8c38185b59236a8640b4c11786c',
    '0x46b3f22f3de9af93f5d46a2cfcc674acb4785f2f',
    '0x0e992462384c381ce6856381cfb7eb4d25bd94d4',
    '0xb8d529c20d20dc87d9fab99bb9756d1036bf3ffd',
    '0x87dda77d46b0603e7a5ac6d93bbbba97fa0aa5b1',
    '0x007a4a562e2ba8f27dfc793d54d75902b13e20b2',
    '0xff545fea675ae38a6e8381ac635b7dfa5b6f06dc',
    '0xb6367ee36656db36b737a28122802c14c98fcf11',
    '0x50f503bd872d90286cebcd9d35a36a9382926186',
    '0x8b0cb6d1aa425fe3ff57d0d796c9cfa4d384024f',
    '0x59741509e614abbe3af30862df442e2196c563c9',
    '0x7b683b0f5078a850b685b0c2f14262c86ea99b8f',
    '0x57a4871d0b237f3cd0a108d84fc6ce6a5044b344',
    '0xc3bfbad2b1a307a1ca7a0fa609f026051fbd3b49',
    '0xed7e1d9861aef4afc0e1697c7f2a38f18a98f162',
    '0x799c8b777777adc323ed59ebdf06795e8b07dd8d',
    '0x0ffb1cbc86b3ad0a17292b7fda577d59c0d7aed9',
    '0x3f29f03d3be2ac8ed855bc98485953901e8173ff',
    '0xee25500c0f305cc42bdcb0f95e1d3186874bc19a',
    '0x7100a4dd6c3cf9c54aed649832a6c0170cf71329',
    '0x00a8c9f77ef75ff0f6605a859bb32e16249f8341',
    '0x4832b79985fb59095adc5534958c52762a54f462',
    '0xa7e43b445cf68caa143a884af673121447f29eae',
    '0xcbc6f8f1a6907841666fd4d5491194144ac75231',
    '0x7a976d7160dadb5ed592b94ee0c79a17c47e82a2',
    '0x8e9c926b95b23fac411e152681f5cf8c6695a0b5',
    '0xa2966ac36bf0790cf6e280f07075045375fdec8c',
    '0xdaab3408b7c80f73d1deaeafab8bf0eac2a4c217',
    '0x7276e812e560ebed03139e48b288867fccb47f10',
    '0x28518e904c0bbed782b39fb7dd3dc24b99a65295',
]

const testnet: string[] = [
    '0xe59d475abe695c7f67a8a2321f33a856b0b4c71d',
    '0xb4094c25f86d628fdd571afc4077f0d0196afb48'
]
