import {abi, cry} from 'thor-devkit'
import { Thor } from '../../thor-rest'
import * as bytecode from './bytecode.json'

// Set EVM version to 'byzantium' in complier for using in Pre-ETH_CONST blocks.
// Compiled data of 'auth-utils.sol'
// tslint:disable-next-line: max-line-length
const listAllABI = { inputs: [], name: 'all', outputs: [{ components: [{ internalType: 'address', name: 'master', type: 'address' }, { internalType: 'address', name: 'endorsor', type: 'address' }, { internalType: 'bytes32', name: 'identity', type: 'bytes32' }, { internalType: 'bool', name: 'active', type: 'bool' }], internalType: 'struct AuthorityUtils.Candidate[]', name: 'list', type: 'tuple[]' }], stateMutability: 'nonpayable', type: 'function' }
// tslint:disable-next-line: max-line-length
const inActivesABI = { inputs: [], name: 'inactives', outputs: [{ components: [{ internalType: 'address', name: 'master', type: 'address' }, { internalType: 'address', name: 'endorsor', type: 'address' }, { internalType: 'bytes32', name: 'identity', type: 'bytes32' }, { internalType: 'bool', name: 'active', type: 'bool' }], internalType: 'struct AuthorityUtils.Candidate[]', name: 'list', type: 'tuple[]' }], stateMutability: 'nonpayable', type: 'function' }

const listAll = new abi.Function(listAllABI as any as abi.Function.Definition)
const inActives = new abi.Function(inActivesABI as any as abi.Function.Definition)

// txID + clauseIndex + creationCount 0x841a6556c524d47030762eb14dc4af897e605d9b
const contractAddr = '0x' + cry.keccak256(Buffer.alloc(40)).slice(12).toString('hex')
/* here we use `POST /account/*` to simulate executing a tx, clause#0 to deploy a `ghost contract`
   which will be dropped after the request, the txID in `POST /account/*` is zero by default then
   we can compute the contract deployed offline and call the methods in clause#1
*/

interface MasterNode {
    master: string,
    endorsor: string,
    identity: string,
    active: boolean,
}

export const ListAll = async (thor: Thor, blockID: string) => {
    const ret = await thor.explain({
        clauses: [
            {
                to: null,
                value: '0',
                data: bytecode.listAll
            }, {
                to: contractAddr,
                value: '0',
                data: listAll.encode()
            }]
    }, blockID)

    if (ret[0].reverted || ret[1].reverted) {
        throw new Error('execution reverted')
    }
    return listAll.decode(ret[1].data).list as MasterNode[]
}

export const ListInactive = async (thor: Thor, blockID: string) => {
    const ret = await thor.explain({
        clauses: [
            {
                to: null,
                value: '0',
                data: bytecode.listInactive
            }, {
                to: contractAddr,
                value: '0',
                data: inActives.encode()
            }]
    }, blockID)

    if (ret[0].reverted || ret[1].reverted) {
        throw new Error('execution reverted')
    }
    return inActives.decode(ret[1].data).list as MasterNode[]
}

